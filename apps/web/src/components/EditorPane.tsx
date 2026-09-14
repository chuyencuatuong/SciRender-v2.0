import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { basicSetup } from 'codemirror';
import type { Diagnostic } from '@scirender/ast';
import type { CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';
import { SnippetBar } from './SnippetBar';

interface Props {
  result: CompileResult | null;
}

const setDiagnostics = StateEffect.define<Array<{ line: number; severity: string }>>();

const diagnosticField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setDiagnostics)) continue;
      const doc = tr.state.doc;
      const marks = effect.value
        .filter((d) => d.line >= 1 && d.line <= doc.lines)
        .map((d) =>
          Decoration.line({ class: `cm-diag-${d.severity}` }).range(doc.line(d.line).from),
        )
        .sort((a, b) => a.from - b.from);
      next = Decoration.set(marks, true);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const THEME = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#1e232d' },
  '.cm-content': { caretColor: '#1b4f9c', padding: '12px 0' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#cfe0f8 !important' },
  '.cm-cursor': { borderLeftColor: '#1b4f9c', borderLeftWidth: '2px' },
});

export function EditorPane({ result }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const source = useStore((s) => s.source);
  const docId = useStore((s) => s.docId);
  const setSource = useStore((s) => s.setSource);
  const gotoLine = useStore((s) => s.gotoLine);

  // ---- create the editor once ---------------------------------------------
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: useStore.getState().source,
        extensions: [
          basicSetup,
          markdown(),
          diagnosticField,
          THEME,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            setSource(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [setSource]);

  // ---- replace the document when a different file is opened ---------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === source) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // ---- push diagnostics into the gutter ----------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const marks = (result?.diagnostics ?? [])
      .filter((d: Diagnostic) => d.severity !== 'info')
      .map((d) => ({ line: d.position.start.line, severity: d.severity }));
    view.dispatch({ effects: setDiagnostics.of(marks) });
  }, [result?.signature, result?.diagnostics.length]);

  // ---- jump to a line on request -----------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !gotoLine) return;
    const line = Math.min(Math.max(1, gotoLine.line), view.state.doc.lines);
    const pos = view.state.doc.line(line).from;
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      scrollIntoView: true,
    });
    view.focus();
  }, [gotoLine?.nonce]);

  const insert = (text: string, caretOffset?: number): void => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const payload = text.includes('$SEL') ? text.replace('$SEL', selected) : text;
    const anchor = from + (caretOffset ?? payload.length);
    view.dispatch({
      changes: { from, to, insert: payload },
      selection: { anchor },
    });
    view.focus();
  };

  return (
    <>
      <SnippetBar onInsert={insert} />
      <div ref={hostRef} className="sr-scroll min-h-0 flex-1 overflow-hidden" />
    </>
  );
}
