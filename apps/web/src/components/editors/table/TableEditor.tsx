import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpToLine, Plus, Trash2 } from 'lucide-react';
import { evaluateGrid } from '@scirender/table-engine';
import { TABLE_MERGE_MARKER, TABLE_HORIZONTAL_MERGE_MARKER } from '@scirender/parser';
import type { CellAlign, TableForm } from '~/lib/card-forms';
import { parseTable, serializeTable } from '~/lib/card-forms';
import type { EditorProps } from '../types';
import { CaptionField } from '../EditorFields';
import { RawEditor } from '../RawEditor';


const ALIGNS: Array<[CellAlign, string]> = [
  ['default', '—'],
  ['left', '⇤'],
  ['center', '↔'],
  ['right', '⇥'],
  ['decimal', '1.2'],
];

type CellRef = { row: number; col: number };
const cellKey = (cell: CellRef): string => `${cell.row}:${cell.col}`;

export function TableEditor({ text, onChange, kind, labels, bibliography, suppressLandscape }: EditorProps): JSX.Element {
  const form = parseTable(text);
  const tableEditorRef = useRef<HTMLDivElement | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const anchorRef = useRef<CellRef | null>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextSelectionRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const up = (): void => { draggingRef.current = false; setDragging(false); };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragging]);

  useEffect(() => {
    if (!selectedCells.size) return;
    const clearSelection = (): void => {
      setSelectedCells(new Set());
      anchorRef.current = null;
      draggingRef.current = false;
      setDragging(false);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // The context menu is rendered through a React portal into document.body,
      // so it is intentionally outside tableEditorRef. Treat that portal as an
      // interactive continuation of the table editor; otherwise the capture
      // listener clears selectedCells before the menu item's onClick can use it.
      if (tableEditorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-sr-table-context-menu]')) return;
      clearSelection();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') clearSelection();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedCells.size]);
  if (!form) return <RawEditor text={text} onChange={onChange} kind={kind} labels={labels} bibliography={bibliography} />;
  const width = form.header.length;
  const totalRows = form.rows.length + 1;
  const evaluated = evaluateGrid({ header: form.header, rows: form.rows });

  const getValue = (cell: CellRef): string => cell.row === -1 ? (form.header[cell.col] ?? '') : (form.rows[cell.row]?.[cell.col] ?? '');
  const allRefs = (): CellRef[] => [
    ...Array.from({ length: width }, (_, col) => ({ row: -1, col })),
    ...form.rows.flatMap((_, row) => Array.from({ length: width }, (_, col) => ({ row, col }))),
  ];
  const rect = (a: CellRef, b: CellRef): Set<string> => {
    const r1 = Math.min(a.row, b.row); const r2 = Math.max(a.row, b.row);
    const c1 = Math.min(a.col, b.col); const c2 = Math.max(a.col, b.col);
    return new Set(allRefs().filter((c) => c.row >= r1 && c.row <= r2 && c.col >= c1 && c.col <= c2).map(cellKey));
  };
  const setSelection = (next: Set<string>, anchor?: CellRef): void => {
    setSelectedCells(next);
    if (anchor) anchorRef.current = anchor;
  };
  const selectWholeColumn = (col: number): Set<string> =>
    new Set(allRefs().filter((cell) => cell.col === col).map(cellKey));
  const selectWholeRow = (row: number): Set<string> =>
    new Set(allRefs().filter((cell) => cell.row === row).map(cellKey));
  const selectCell = (cell: CellRef, e: React.MouseEvent): void => {
    e.stopPropagation();
    const meta = e.ctrlKey || e.metaKey;
    if (cell.row === -1) {
      if (e.shiftKey && anchorRef.current) {
        const c1 = Math.min(anchorRef.current.col, cell.col);
        const c2 = Math.max(anchorRef.current.col, cell.col);
        const next = new Set<string>();
        for (let c = c1; c <= c2; c++) selectWholeColumn(c).forEach((k) => next.add(k));
        setSelection(next, cell);
      } else if (meta) {
        const next = new Set<string>(selectedCells);
        selectWholeColumn(cell.col).forEach((k) => next.has(k) ? next.delete(k) : next.add(k));
        setSelection(next, cell);
      } else {
        setSelection(selectWholeColumn(cell.col), cell);
      }
      draggingRef.current = false;
      setDragging(false);
      return;
    }
    if (e.shiftKey && anchorRef.current) {
      setSelection(rect(anchorRef.current, cell));
    } else if (meta) {
      const next = new Set<string>(selectedCells);
      const k = cellKey(cell);
      if (next.has(k)) next.delete(k); else next.add(k);
      setSelection(next, cell);
    } else {
      setSelection(new Set([cellKey(cell)]), cell);
    }
    draggingRef.current = !meta && !e.shiftKey;
    setDragging(draggingRef.current);
  };
  const dragEnter = (cell: CellRef): void => {
    if (!draggingRef.current || !anchorRef.current) return;
    setSelectedCells(rect(anchorRef.current, cell));
  };

  const push = (next: TableForm): void => onChange(serializeTable(next));
  const writeCellOn = (base: TableForm, cell: CellRef, value: string): TableForm => {
    if (cell.row === -1) {
      const header = base.header.slice();
      header[cell.col] = value;
      return { ...base, header };
    }
    const rows = base.rows.map((r) => r.slice());
    const row = rows[cell.row] ?? Array.from({ length: width }, () => '');
    row[cell.col] = value;
    rows[cell.row] = row;
    return { ...base, rows };
  };
  const writeCell = (cell: CellRef, value: string): TableForm => writeCellOn(form, cell, value);
  const applyMatrix = (start: CellRef, matrix: string[][]): void => {
    let next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) };
    const neededRows = Math.max(0, start.row + matrix.length - next.rows.length);
    if (neededRows) next.rows.push(...Array.from({ length: neededRows }, () => Array.from({ length: width }, () => '')));
    const neededCols = Math.max(0, start.col + Math.max(0, ...matrix.map((r) => r.length)) - width);
    if (neededCols) {
      next.header.push(...Array.from({ length: neededCols }, () => ''));
      next.align.push(...Array.from({ length: neededCols }, () => 'default' as CellAlign));
      next.rows = next.rows.map((r) => [...r, ...Array.from({ length: neededCols }, () => '')]);
    }
    matrix.forEach((row, ri) => row.forEach((value, ci) => {
      const r = start.row + ri;
      const c = start.col + ci;
      if (r === -1) next.header[c] = value;
      else if (r >= 0) next.rows[r]![c] = value;
    }));
    push(next);
  };
  const selectedList = Array.from(selectedCells as Set<string>).map((k: string) => { const [row = 0, col = 0] = k.split(':').map(Number); return { row, col }; });
  const bounds = selectedList.length ? {
    r1: Math.min(...selectedList.map((c) => c.row)), r2: Math.max(...selectedList.map((c) => c.row)),
    c1: Math.min(...selectedList.map((c) => c.col)), c2: Math.max(...selectedList.map((c) => c.col)),
  } : null;
  const rectangularSelection = Boolean(
    bounds && selectedCells.size === (bounds.r2 - bounds.r1 + 1) * (bounds.c2 - bounds.c1 + 1),
  );
  const horizontalMerge = Boolean(rectangularSelection && bounds && bounds.r1 === bounds.r2 && bounds.c2 > bounds.c1 && bounds.r1 >= 0);
  const verticalMerge = Boolean(rectangularSelection && bounds && bounds.c1 === bounds.c2 && bounds.r2 > bounds.r1 && bounds.r1 >= 0);

  const getSelectionModel = (cells: Set<string>): { selectedList: CellRef[]; bounds: { r1: number; r2: number; c1: number; c2: number } | null } => {
    const list = Array.from(cells).map((k) => {
      const [row = 0, col = 0] = k.split(':').map(Number);
      return { row, col };
    });
    const b = list.length ? {
      r1: Math.min(...list.map((c) => c.row)), r2: Math.max(...list.map((c) => c.row)),
      c1: Math.min(...list.map((c) => c.col)), c2: Math.max(...list.map((c) => c.col)),
    } : null;
    return { selectedList: list, bounds: b };
  };

  const mergeSelected = (mode: 'horizontal' | 'vertical', cells = selectedCells): void => {
    const model = getSelectionModel(cells);
    if (!model.bounds) return;
    const b = model.bounds;
    const rectangular = cells.size === (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
    const canHorizontal = rectangular && b.r1 === b.r2 && b.c2 > b.c1 && b.r1 >= 0;
    const canVertical = rectangular && b.c1 === b.c2 && b.r2 > b.r1 && b.r1 >= 0;
    let next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) };
    if (mode === 'horizontal' && canHorizontal) {
      for (let c = b.c1 + 1; c <= b.c2; c++) next.rows[b.r1]![c] = TABLE_HORIZONTAL_MERGE_MARKER;
    }
    if (mode === 'vertical' && canVertical) {
      for (let r = b.r1 + 1; r <= b.r2; r++) next.rows[r]![b.c1] = TABLE_MERGE_MARKER;
    }
    push(next);
  };

  const addRowsAt = (at: number, count = 1): void => {
    const rows = form.rows.map((r) => r.slice());
    rows.splice(Math.max(0, Math.min(rows.length, at)), 0, ...Array.from({ length: count }, () => Array.from({ length: width }, () => '')));
    push({ ...form, rows });
  };
  const deleteSelectedRows = (selectionBounds = bounds): void => {
    if (!selectionBounds || selectionBounds.r1 < 0) return;
    const rows = form.rows.filter((_, r) => r < selectionBounds.r1 || r > selectionBounds.r2);
    push({ ...form, rows: rows.length ? rows : [Array.from({ length: width }, () => '')] });
  };
  const addColumnAt = (at: number): void => {
    const c = Math.max(0, Math.min(width, at));
    push({
      ...form,
      header: [...form.header.slice(0, c), '', ...form.header.slice(c)],
      align: [...form.align.slice(0, c), 'default', ...form.align.slice(c)],
      rows: form.rows.map((r) => [...r.slice(0, c), '', ...r.slice(c)]),
    });
  };
  const deleteSelectedColumns = (selectionBounds = bounds): void => {
    if (!selectionBounds) return;
    const keep = Array.from({ length: width }, (_, c) => c < selectionBounds.c1 || c > selectionBounds.c2);
    const header = form.header.filter((_, c) => keep[c]);
    const align = form.align.filter((_, c) => keep[c]);
    const rows = form.rows.map((r) => r.filter((_, c) => keep[c]));
    push({
      ...form,
      header: header.length ? header : [''],
      align: align.length ? align : ['default'],
      rows: rows.map((r) => r.length ? r : ['']),
    });
  };
  const setSelectedAlignment = (mode: CellAlign, selectionBounds = bounds): void => {
    if (!selectionBounds) return;
    const align = form.align.slice();
    for (let c = selectionBounds.c1; c <= selectionBounds.c2; c++) align[c] = mode;
    push({ ...form, align });
  };
  const unmergeSelected = (cells = selectedCells): void => {
    const model = getSelectionModel(cells);
    if (!model.selectedList.length) return;
    const next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) };
    model.selectedList.forEach((cell) => {
      if (cell.row === -1) {
        if (next.header[cell.col] === TABLE_HORIZONTAL_MERGE_MARKER) next.header[cell.col] = '';
      } else if (next.rows[cell.row]?.[cell.col] === TABLE_MERGE_MARKER || next.rows[cell.row]?.[cell.col] === TABLE_HORIZONTAL_MERGE_MARKER) {
        next.rows[cell.row]![cell.col] = '';
      }
    });
    push(next);
  };
  const beginFill = (event: React.MouseEvent, source: CellRef): void => {
    event.preventDefault();
    event.stopPropagation();
    const sourceColumn = bounds?.c2 ?? source.col;
    const sourceTop = bounds?.r1 ?? source.row;
    const sourceBottom = bounds?.r2 ?? source.row;
    if (source.row < 0) return;
    const sourceValues = Array.from({ length: Math.max(1, sourceBottom - sourceTop + 1) }, (_, i) => form.rows[sourceTop + i]?.[sourceColumn] ?? '');
    const numeric = sourceValues.every((v) => v.trim() !== '' && Number.isFinite(Number(v)));
    const n0 = Number(sourceValues[0] ?? 0);
    const n1 = Number(sourceValues[sourceValues.length - 1] ?? n0);
    const step = numeric && sourceValues.length > 1 ? n1 - n0 : 1;
    const shiftFormula = (value: string, deltaRows: number): string => value.replace(/\b([A-Z]{1,3})(\d+)\b/g, (_m, col: string, row: string) => `${col}${Math.max(1, Number(row) + deltaRows)}`);
    const targetFromPoint = (clientX: number, clientY: number): CellRef | null => {
      const el = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-sr-cell]');
      const key = el?.dataset.srCell;
      if (!key) return null;
      const [row = 0, col = 0] = key.split(':').map(Number);
      return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
    };
    const onMove = (e: MouseEvent): void => {
      const target = targetFromPoint(e.clientX, e.clientY);
      if (target && target.row >= sourceBottom) setSelectedCells(rect({ row: sourceTop, col: sourceColumn }, { row: target.row, col: sourceColumn }));
    };
    const onUp = (e: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const target = targetFromPoint(e.clientX, e.clientY);
      if (!target || target.row <= sourceBottom) return;
      const next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) };
      while (next.rows.length <= target.row) next.rows.push(Array.from({ length: width }, () => ''));
      for (let r = sourceBottom + 1; r <= target.row; r++) {
        const offset = r - sourceBottom;
        const seed = sourceValues[(offset - 1) % sourceValues.length] ?? '';
        const value = /^\s*=/.test(seed) ? shiftFormula(seed, offset) : numeric ? String(n1 + step * offset) : seed;
        next.rows[r]![sourceColumn] = value;
      }
      push(next);
      setSelection(rect({ row: sourceTop, col: sourceColumn }, { row: target.row, col: sourceColumn }));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onTableKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
    if (e.key === ' ' && input) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedCells.size > 1) {
      // Let the native `copy` event below own the clipboard payload. Preventing
      // the keydown here drops clipboardData on some Chromium builds.
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCells.size > 1) {
      e.preventDefault();
      let next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) };
      selectedList.forEach((cell) => { next = writeCellOn(next, cell, ''); });
      push(next);
      return;
    }
    const sourceCell = input?.closest<HTMLElement>('[data-sr-cell]')?.dataset.srCell;
    const sourceRef = sourceCell ? (() => { const [row = 0, col = 0] = sourceCell.split(':').map(Number); return { row, col }; })() : null;
    const focus = sourceRef && Number.isFinite(sourceRef.row) && Number.isFinite(sourceRef.col) ? sourceRef : selectedList[0];
    if (!focus) return;
    const nav = (row: number, col: number, select = false): void => {
      const maxRow = form.rows.length - 1;
      const clampedCol = Math.max(0, Math.min(width - 1, col));
      if (row === -1 || row > maxRow) return;
      if (select) {
        const next = rect(focus, { row, col: clampedCol }); setSelectedCells(next);
      } else {
        setSelection(new Set([cellKey({ row, col: clampedCol })]), { row, col: clampedCol });
      }
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-sr-cell="${row}:${clampedCol}"] input`);
        el?.focus();
        if (el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
      });
    };
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let row = focus.row; let col = focus.col + dir;
      if (col >= width) { col = 0; row += 1; }
      if (col < 0) { col = width - 1; row -= 1; }
      if (row > form.rows.length - 1) {
        push({ ...form, rows: [...form.rows, Array.from({ length: width }, () => '')] });
        row = form.rows.length;
      }
      if (row >= 0) nav(row, col);
      return;
    }
    if (e.key === 'Enter' && input && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      nav(focus.row === -1 ? 0 : focus.row + 1, focus.col);
      return;
    }
    if (e.altKey && e.key === 'Enter' && input) {
      e.preventDefault();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const value = input.value.slice(0, start) + '<br>' + input.value.slice(end);
      push(writeCell(focus, value));
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-sr-cell="${focus.row}:${focus.col}"] input`);
        if (el instanceof HTMLInputElement) { el.focus(); const at = start + 4; el.setSelectionRange(at, at); }
      });
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && input && input.selectionStart === 0 && input.selectionEnd === 0 && e.key === 'ArrowLeft') return;
  };

  const renderCell = (cell: CellRef, value: string, merged = false, header = false): JSX.Element => (
    <th
      key={cellKey(cell)}
      data-sr-cell={cellKey(cell)}
      onMouseDown={(e) => selectCell(cell, e)}
      onMouseEnter={() => dragEnter(cell)}
      className={`${header ? 'bg-ink-50' : 'bg-[var(--sr-card)]'} border-b border-ink-900/[0.06] p-0 align-top ${selectedCells.has(cellKey(cell)) ? 'bg-sky-500/15 ring-1 ring-inset ring-sky-400/40' : ''}`}
    >
      <div className="flex items-center gap-1">
        {header ? null : cell.row > 0 ? (
          <button type="button" className={`shrink-0 px-1 ${value === TABLE_MERGE_MARKER ? 'text-sky-500' : 'text-ink-300 hover:text-sky-600'}`} title="Gộp với ô phía trên" onClick={(e) => { e.stopPropagation(); const next = writeCell(cell, value === TABLE_MERGE_MARKER ? '' : TABLE_MERGE_MARKER); push(next); }}><ArrowUpToLine size={11} /></button>
        ) : null}
        <input
          className="w-full min-w-[72px] bg-transparent px-1.5 py-1 text-[12px] outline-none"
          value={value}
          disabled={merged}
          aria-label={header ? `Tiêu đề cột ${cell.col + 1}` : `Ô dòng ${cell.row + 1} cột ${cell.col + 1}`}
          onChange={(e) => push(writeCell(cell, e.target.value))}
        />
        {header && width > 1 ? (
          <button type="button" className="px-1 text-ink-300 hover:text-flag-600" title="Xóa cột" onClick={(e) => { e.stopPropagation(); const c = cell.col; push({ ...form, header: form.header.filter((_, k) => k !== c), align: form.align.filter((_, k) => k !== c), rows: form.rows.map((r) => r.filter((_, k) => k !== c)) }); }}><Trash2 size={10} /></button>
        ) : null}
      </div>
    </th>
  );

  const closeContextMenu = (): void => {
    contextSelectionRef.current = null;
    setContextMenu(null);
  };
  const contextCells = contextMenu ? (contextSelectionRef.current ?? selectedCells) : selectedCells;
  const contextModel = getSelectionModel(contextCells);
  const contextRectangular = Boolean(
    contextModel.bounds && contextCells.size === (contextModel.bounds.r2 - contextModel.bounds.r1 + 1) * (contextModel.bounds.c2 - contextModel.bounds.c1 + 1),
  );
  const contextHorizontalMerge = Boolean(contextRectangular && contextModel.bounds && contextModel.bounds.r1 === contextModel.bounds.r2 && contextModel.bounds.c2 > contextModel.bounds.c1 && contextModel.bounds.r1 >= 0);
  const contextVerticalMerge = Boolean(contextRectangular && contextModel.bounds && contextModel.bounds.c1 === contextModel.bounds.c2 && contextModel.bounds.r2 > contextModel.bounds.r1 && contextModel.bounds.r1 >= 0);

  return (
    <div ref={tableEditorRef} data-sr-table-editor-active className="space-y-2" onMouseUp={() => { draggingRef.current = false; setDragging(false); }} onKeyDownCapture={onTableKeyDownCapture} onContextMenu={(e) => { if (e.target instanceof HTMLElement && e.target.closest('[data-sr-cell]')) { e.preventDefault(); contextSelectionRef.current = new Set(selectedCells); setContextMenu({ x: e.clientX, y: e.clientY }); } }} onCopyCapture={(e) => {
      if (selectedCells.size <= 1 || !bounds) return;
      e.preventDefault();
      e.stopPropagation();
      const textOut = Array.from({ length: bounds.r2 - bounds.r1 + 1 }, (_, ri) => Array.from({ length: bounds.c2 - bounds.c1 + 1 }, (_, ci) => selectedCells.has(`${bounds.r1 + ri}:${bounds.c1 + ci}`) ? getValue({ row: bounds.r1 + ri, col: bounds.c1 + ci }) : '').join('\t')).join('\n');
      e.clipboardData.setData('text/plain', textOut);
    }} onPasteCapture={(e) => {
      const start = bounds ? { row: bounds.r1, col: bounds.c1 } : anchorRef.current;
      const textData = e.clipboardData.getData('text/plain');
      if (!start || (!textData.includes('\t') && !textData.includes('\n'))) return;
      e.preventDefault();
      e.stopPropagation();
      applyMatrix(start, textData.replace(/\r/g, '').split('\n').map((r) => r.split('\t')));
    }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-ink-400">{selectedCells.size ? `${selectedCells.size} ô đang chọn` : 'Chọn vùng ô'}</span>
        <select aria-label="Định dạng số" className="ml-auto h-7 rounded-md border border-slate-200 bg-transparent px-2 text-[10px] dark:border-slate-700" value={form.attrs['number-format'] ?? 'auto'} onChange={(e) => push({ ...form, attrs: { ...form.attrs, 'number-format': e.target.value } })}>
          {['auto', '0.0', '0.00', '0.000'].map((v) => <option key={v} value={v}>{v === 'auto' ? 'Tự động' : v}</option>)}
        </select>
        {selectedCells.size > 1 && (horizontalMerge || verticalMerge) ? (
          <div className="ml-auto flex gap-1">
            {horizontalMerge ? <button type="button" onClick={() => mergeSelected('horizontal')} className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">⇆ Gộp ngang</button> : null}
            {verticalMerge ? <button type="button" onClick={() => mergeSelected('vertical')} className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">⇵ Gộp dọc</button> : null}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700">
        <table className="w-full border-collapse text-[12px]" onDragStart={(e) => e.preventDefault()}>
          <thead>
            <tr>
              <th className="w-8 border-b border-ink-900/[0.06] bg-ink-50 p-1 text-center text-[9px] text-ink-400">#</th>
              {form.header.map((h, c) => renderCell({ row: -1, col: c }, h, h === TABLE_HORIZONTAL_MERGE_MARKER, true))}
            </tr>
          </thead>
          <tbody>
            {form.rows.map((row, r) => (
              <tr key={r}>
                <th
                  className="w-8 cursor-pointer select-none bg-ink-50 px-1 py-1 text-center font-mono text-[9px] text-ink-400 hover:bg-sky-500/10"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const meta = e.ctrlKey || e.metaKey;
                    if (e.shiftKey && anchorRef.current) {
                      const r1 = Math.min(anchorRef.current.row, r);
                      const r2 = Math.max(anchorRef.current.row, r);
                      const next = new Set<string>();
                      for (let rr = r1; rr <= r2; rr++) selectWholeRow(rr).forEach((k) => next.add(k));
                      setSelection(next, { row: r, col: 0 });
                    } else if (meta) {
                      const next = new Set<string>(selectedCells);
                      selectWholeRow(r).forEach((k) => next.has(k) ? next.delete(k) : next.add(k));
                      setSelection(next, { row: r, col: 0 });
                    } else {
                      setSelection(selectWholeRow(r), { row: r, col: 0 });
                    }
                    draggingRef.current = false;
                    setDragging(false);
                  }}
                  title={`Chọn hàng ${r + 1}`}
                >{r + 1}</th>
                {Array.from({ length: width }, (_, c) => {
                  const value = row[c] ?? '';
                  const merged = value === TABLE_MERGE_MARKER || value === TABLE_HORIZONTAL_MERGE_MARKER;
                  const formula = evaluated.evaluations[r]?.[c]?.formula;
                  return (
                    <td key={c} data-sr-cell={`${r}:${c}`} onMouseDown={(e) => { e.stopPropagation(); selectCell({ row: r, col: c }, e); }} onMouseEnter={() => dragEnter({ row: r, col: c })} className={`relative border-b border-ink-900/[0.045] p-0 align-top ${selectedCells.has(`${r}:${c}`) ? 'bg-sky-500/25 ring-1 ring-inset ring-sky-400/50' : ''}`}>
                      <div className="flex items-center">
                        {r > 0 ? <button type="button" className={`shrink-0 px-1 ${value === TABLE_MERGE_MARKER ? 'text-sky-500' : 'text-ink-300 hover:text-sky-600'}`} title={value === TABLE_MERGE_MARKER ? 'Bỏ gộp dọc' : 'Gộp dọc với ô trên'} onClick={(e) => { e.stopPropagation(); push(writeCell({ row: r, col: c }, value === TABLE_MERGE_MARKER ? '' : TABLE_MERGE_MARKER)); }}><ArrowUpToLine size={11} /></button> : null}
                        <input className="w-full min-w-[72px] bg-transparent px-1.5 py-1 outline-none" value={value} disabled={merged} placeholder={merged ? (value === TABLE_HORIZONTAL_MERGE_MARKER ? '(gộp ngang)' : '(gộp dọc)') : undefined} aria-label={`Ô dòng ${r + 1} cột ${c + 1}`} onChange={(e) => push(writeCell({ row: r, col: c }, e.target.value))} />
                        {formula ? <div className={`max-w-[90px] truncate px-1 text-[9px] ${evaluated.evaluations[r]?.[c]?.error ? 'text-flag-600' : 'text-emerald-600'}`}>→ {evaluated.values[r]?.[c]}</div> : null}
                        {c === width - 1 ? <button type="button" className="px-1 text-ink-300 hover:text-flag-600" title="Xóa dòng" onClick={(e) => { e.stopPropagation(); push({ ...form, rows: form.rows.filter((_, k) => k !== r) }); }}><Trash2 size={10} /></button> : null}
                      </div>
                      {bounds?.r2 === r && bounds?.c2 === c && !merged ? <button type="button" aria-label="Kéo điền dữ liệu" title="Kéo để điền dữ liệu" onMouseDown={(e) => beginFill(e, { row: r, col: c })} className="absolute bottom-[-3px] right-[-3px] z-10 h-2 w-2 cursor-crosshair rounded-[2px] border border-white bg-sky-400 shadow-sm dark:border-slate-900" /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="bg-ink-50" />
              <td colSpan={width} className="p-1.5 text-center">
                <button type="button" onClick={() => push({ ...form, rows: [...form.rows, Array.from({ length: width }, () => '')] })} className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-[10.5px] font-medium text-slate-500 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700"><Plus size={11} /> thêm hàng</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <MiniBtn onClick={() => push({ ...form, header: [...form.header, ''], align: [...form.align, 'default'], rows: form.rows.map((r) => [...r, '']) })}><Plus size={11} /> cột</MiniBtn>
        {!suppressLandscape ? <label className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[10.5px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={form.attrs.orientation === 'landscape'} onChange={(e) => push({ ...form, attrs: { ...form.attrs, ...(e.target.checked ? { orientation: 'landscape' } : (() => { const a = { ...form.attrs }; delete a.orientation; delete a.landscape; return a; })()) } })} />
          Khổ giấy ngang (Landscape)
        </label> : null}
      </div>
      <CaptionField caption={form.caption} label={form.label} labelHint="tbl:ten-nhan" onChange={(caption, label) => push({ ...form, caption, label })} />
      {contextMenu ? (
        <TableContextMenu
          point={contextMenu}
          onClose={closeContextMenu}
          actions={
            <>
              {contextHorizontalMerge ? <MenuAction label="Gộp vùng ngang (>>)" onClick={() => { mergeSelected('horizontal', contextCells); closeContextMenu(); }} /> : null}
              {contextVerticalMerge ? <MenuAction label="Gộp vùng dọc (^^)" onClick={() => { mergeSelected('vertical', contextCells); closeContextMenu(); }} /> : null}
              {contextCells.size > 1 ? <MenuAction label="Tách gộp / Hủy merge" onClick={() => { unmergeSelected(contextCells); closeContextMenu(); }} /> : null}
              {(contextHorizontalMerge || contextVerticalMerge || contextCells.size > 1) ? <div className="my-1 h-px bg-white/10" /> : null}
              <MenuAction label="Thêm hàng trên" onClick={() => { addRowsAt(contextModel.bounds && contextModel.bounds.r1 >= 0 ? contextModel.bounds.r1 : form.rows.length); closeContextMenu(); }} />
              <MenuAction label="Thêm hàng dưới" onClick={() => { addRowsAt((contextModel.bounds && contextModel.bounds.r2 >= 0 ? contextModel.bounds.r2 : form.rows.length - 1) + 1); closeContextMenu(); }} />
              <MenuAction label="Xóa hàng đang chọn" disabled={!contextModel.bounds || contextModel.bounds.r1 < 0} onClick={() => { deleteSelectedRows(contextModel.bounds); closeContextMenu(); }} />
              <MenuAction label="Thêm cột trái" onClick={() => { addColumnAt(contextModel.bounds?.c1 ?? width); closeContextMenu(); }} />
              <MenuAction label="Thêm cột phải" onClick={() => { addColumnAt((contextModel.bounds?.c2 ?? width - 1) + 1); closeContextMenu(); }} />
              <MenuAction label="Xóa cột đang chọn" disabled={!contextModel.bounds} onClick={() => { deleteSelectedColumns(contextModel.bounds); closeContextMenu(); }} />
              <div className="my-1 h-px bg-white/10" />
              <MenuAction label="Căn trái" onClick={() => { setSelectedAlignment('left', contextModel.bounds); closeContextMenu(); }} />
              <MenuAction label="Căn giữa" onClick={() => { setSelectedAlignment('center', contextModel.bounds); closeContextMenu(); }} />
              <MenuAction label="Căn phải" onClick={() => { setSelectedAlignment('right', contextModel.bounds); closeContextMenu(); }} />
              <MenuAction label="Căn theo dấu thập phân" onClick={() => { setSelectedAlignment('decimal', contextModel.bounds); closeContextMenu(); }} />
              <div className="my-1 h-px bg-white/10" />
              <MenuAction label="Xóa dữ liệu vùng chọn" disabled={!contextCells.size} onClick={() => { let next = { ...form, header: form.header.slice(), rows: form.rows.map((r) => r.slice()) }; contextModel.selectedList.forEach((cell) => { next = writeCellOn(next, cell, ''); }); push(next); closeContextMenu(); }} />
            </>
          }
        />
      ) : null}
    </div>
  );
}

function TableContextMenu({
  point,
  onClose,
  actions,
}: {
  point: { x: number; y: number };
  onClose: () => void;
  actions: React.ReactNode;
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: point.x, top: point.y, visible: false });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gutter = 8;
    const maxLeft = Math.max(gutter, window.innerWidth - rect.width - gutter);
    const maxTop = Math.max(gutter, window.innerHeight - rect.height - gutter);
    let left = point.x;
    let top = point.y;
    if (left + rect.width + gutter > window.innerWidth) left = point.x - rect.width;
    if (top + rect.height + gutter > window.innerHeight) top = point.y - rect.height;
    setPosition({
      left: Math.min(maxLeft, Math.max(gutter, left)),
      top: Math.min(maxTop, Math.max(gutter, top)),
      visible: true,
    });
  }, [point.x, point.y, actions]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-sr-table-context-menu="1"
      className="sr-table-context-menu fixed z-[9999] w-[228px] rounded-xl p-1.5 shadow-2xl backdrop-blur-md"
      style={{ left: position.left, top: position.top, visibility: position.visible ? 'visible' : 'hidden' }}
      onPointerDownCapture={(event) => event.stopPropagation()}
      onMouseDownCapture={(event) => event.stopPropagation()}
    >
      {actions}
    </div>,
    document.body,
  );
}

function MenuAction({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}
      className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] hover:bg-white/10 disabled:opacity-30"
    >
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- pieces */

function MiniBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[7px] bg-ink-900/[0.04] px-2 py-1 text-[11px] text-ink-600 transition hover:bg-sky-500/10 hover:text-deep-600"
    >
      {children}
    </button>
  );
}

