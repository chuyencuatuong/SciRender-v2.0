import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Braces, FileText, Redo2, Undo2 } from 'lucide-react';
import {
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
import { useStore } from '~/state/store';
import { CardShell, type DropZone } from './CardShell';
import { InsertMenu } from './InsertMenu';
import { SourceDialog } from './SourceDialog';
import { FrontMatterDialog } from './FrontMatterDialog';

let seq = 0;
const nextId = (): string => `card-new-${seq++}`;

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
export function CanvasPane(): JSX.Element {
  const source = useStore((s) => s.source);
  const docId = useStore((s) => s.docId);
  const setSource = useStore((s) => s.setSource);
  const addAssets = useStore((s) => s.addAssets);
  const gotoLine = useStore((s) => s.gotoLine);

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

  const mine = useRef(source);
  const undoStack = useRef<CanvasDoc[]>([]);
  const redoStack = useRef<CanvasDoc[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

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

  const insertAt = (index: number, text: string, label?: string): void => {
    const cards = doc.cards.slice();
    const card: Card = { id: nextId(), kind: detectKind(text), text, line: 0 };
    cards.splice(index, 0, card);
    setCards(cards);
    setSelected(index);
    if (label) setRecognised({ id: card.id, label, raw: text });
  };

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
    const host = listRef.current;
    if (!host) return;
    const handler = (e: ClipboardEvent): void => {
      void smartPaste(e);
    };
    host.addEventListener('paste', handler);
    return () => host.removeEventListener('paste', handler);
  }, [smartPaste]);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
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
    listRef.current
      ?.querySelector(`[data-card-index="${index}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [gotoLine?.nonce]);

  const title = useMemo(() => /^title:\s*(.+)$/m.exec(doc.frontMatter)?.[1]?.trim() ?? '', [
    doc.frontMatter,
  ]);

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-200 bg-ink-50/60 px-2">
        <InsertMenu onInsert={(tpl) => insertAt(doc.cards.length, tpl.text)} />
        <button
          type="button"
          onClick={() => setShowFront(true)}
          className="inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition hover:border-sky-400 hover:text-deep-700"
        >
          <FileText size={13} /> Thông tin tài liệu
        </button>
        <button
          type="button"
          onClick={() => setShowSource(true)}
          className="inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition hover:border-sky-400 hover:text-deep-700"
        >
          <Braces size={13} /> Xem mã nguồn
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            onClick={undo}
            className="grid h-6 w-6 place-items-center rounded text-ink-500 hover:bg-white hover:text-deep-600"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            title="Làm lại (Ctrl+Y)"
            aria-label="Làm lại"
            onClick={redo}
            className="grid h-6 w-6 place-items-center rounded text-ink-500 hover:bg-white hover:text-deep-600"
          >
            <Redo2 size={13} />
          </button>
          <span className="ml-1 text-[11px] text-ink-400">{doc.cards.length} khối</span>
        </div>
      </div>

      <div ref={listRef} className="sr-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {title ? (
          <div className="px-0.5 text-[12px] text-ink-500">
            <span className="font-medium text-ink-700">{title}</span> · front matter nằm trong
            “Thông tin tài liệu”
          </div>
        ) : null}

        {doc.cards.map((card, index) => (
          <CardShell
            key={card.id}
            card={card}
            index={index}
            total={doc.cards.length}
            selected={selected === index}
            dropZone={drag?.over === index ? drag.zone : null}
            recognised={recognised?.id === card.id ? recognised.label : null}
            onSelect={() => setSelected(index)}
            onChange={(text) => updateCard(index, text)}
            onMove={(delta) => moveBy(index, delta)}
            onDuplicate={() => duplicateAt(index)}
            onDelete={() => removeAt(index)}
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
        ))}

        <div className="flex items-center gap-2 pt-1">
          <InsertMenu
            compact
            label="Thêm khối ở cuối"
            onInsert={(tpl: CardTemplate) => insertAt(doc.cards.length, tpl.text)}
          />
          <span className="text-[11px] text-ink-400">
            Bấm vào một khối rồi Ctrl+V — app tự nhận dạng ảnh, bảng Excel, LaTeX hay code.
          </span>
        </div>
      </div>

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
    </>
  );
}
