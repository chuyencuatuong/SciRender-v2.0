import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { CARD_TEMPLATES, toCards, type CanvasDoc } from '~/lib/cards';
import { useStore } from '~/state/store';

type RequestWithNonce = { nonce: number; [key: string]: unknown };

export interface CanvasStoreSyncOptions {
  mine: MutableRefObject<string>;
  mineDocId: MutableRefObject<string>;
  setDoc: Dispatch<SetStateAction<CanvasDoc>>;
  setSelected: Dispatch<SetStateAction<number>>;
  setActiveBlockId: (id: string | null) => void;
  insertBlockRequest: RequestWithNonce | null | undefined;
  citationInsertRequest: RequestWithNonce | null | undefined;
  gotoLine: { line: number; nonce: number } | null | undefined;
  noteBlockUsed: (templateId: string) => void;
  doc: CanvasDoc;
  undoStack: MutableRefObject<CanvasDoc[]>;
  redoStack: MutableRefObject<CanvasDoc[]>;
  viewportInsertIndex: () => number;
  insertAt: (index: number, text: string, label?: string) => void;
  selectCard: (index: number) => void;
  listRefs: RefObject<HTMLDivElement>[];
}

export function useCanvasStoreSync(options: CanvasStoreSyncOptions): void {
  const {
    mine, mineDocId, setDoc, setSelected, setActiveBlockId,
    insertBlockRequest, citationInsertRequest, gotoLine, noteBlockUsed,
    doc, undoStack, redoStack, viewportInsertIndex, insertAt, selectCard, listRefs,
  } = options;

  const insertBlockSeen = useRef(insertBlockRequest?.nonce ?? 0);
  const citationInsertSeen = useRef(citationInsertRequest?.nonce ?? 0);

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
  }, [mine, mineDocId, setActiveBlockId, setDoc, setSelected]);

  useEffect(() => {
    const nonce = insertBlockRequest?.nonce ?? 0;
    if (nonce === insertBlockSeen.current) return;
    insertBlockSeen.current = nonce;
    const tpl = CARD_TEMPLATES.find((t) => t.id === insertBlockRequest?.templateId);
    if (!tpl) return;
    noteBlockUsed(tpl.id);
    const anchorId = typeof insertBlockRequest?.afterBlockId === 'string' ? insertBlockRequest.afterBlockId : null;
    const anchorIndex = anchorId ? doc.cards.findIndex((c) => c.id === anchorId) : -1;
    const at = anchorIndex >= 0 ? anchorIndex + 1 : viewportInsertIndex();
    insertAt(at, tpl.text);
    // The request is nonce based; the dependency is intentionally only the nonce.
  }, [insertBlockRequest?.nonce]);

  useEffect(() => {
    const nonce = citationInsertRequest?.nonce ?? 0;
    if (nonce === citationInsertSeen.current) return;
    citationInsertSeen.current = nonce;
    // AutoTextarea consumes the actual selection/caret. This effect preserves
    // the existing request acknowledgment boundary without duplicating editor state.
  }, [citationInsertRequest?.nonce]);

  useEffect(() => {
    if (!gotoLine) return;
    const index = doc.cards.findIndex((c, i) => {
      const next = doc.cards[i + 1];
      return c.line <= gotoLine.line && (!next || next.line > gotoLine.line);
    });
    if (index < 0) return;
    selectCard(index);
    for (const ref of listRefs) {
      ref.current
        ?.querySelector(`[data-card-index="${index}"]`)
        ?.scrollIntoView({ block: 'center' });
    }
  }, [gotoLine?.nonce]);
}
