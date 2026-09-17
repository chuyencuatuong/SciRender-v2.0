import type { ResolvedTemplate } from '@scirender/template-engine';
import {
  isCode,
  isList,
  isSplittable,
  isTable,
  lineBoxes,
  offsetAtLineStart,
  snapToWord,
  splitCodeBlock,
  splitElementAt,
  splitList,
  splitTable,
} from './split.js';

export interface PaginateOptions {
  contentWidthPx: number;
  contentHeightPx: number;
  orphans: number;
  widows: number;
  keepHeadingWithNext: boolean;
  /** `data-sr-type` values that must never be split across pages. */
  atomicTypes: string[];
  /** Columns per printed page. 1 = a column is a page. */
  columns: number;
  columnGapPx: number;
  /** Footnote number -> `<li>` HTML. Empty when the template has none. */
  footnotes: Record<string, string>;
  splitTables: boolean;
  tableOrphans: number;
  splitLists: boolean;
  /** Carry a long fenced code block over a page break instead of moving it whole. */
  splitCode: boolean;
  /** Minimum source lines kept on each side of a code-block split. */
  codeOrphans: number;
  continuedLabel: string;
}

export interface LayoutWarning {
  code: string;
  message: string;
  nodeId: string | null;
  line: number | null;
}

export interface PaginateResult {
  /** Inner HTML of each page body, in order. */
  pages: string[];
  warnings: LayoutWarning[];
  /** nodeId -> 1-based page number. Powers "jump to page" from the outline. */
  pageOfNode: Record<string, number>;
  durationMs: number;
}

export function optionsFromTemplate(t: ResolvedTemplate): PaginateOptions {
  const d = t.descriptor;
  return {
    contentWidthPx: t.metrics.contentWidthPx,
    contentHeightPx: t.metrics.contentHeightPx,
    orphans: d.layout.orphans,
    widows: d.layout.widows,
    keepHeadingWithNext: d.layout.keepHeadingWithNext,
    atomicTypes: d.layout.atomicBlocks,
    columns: Math.max(1, Math.round(d.page.columns)),
    columnGapPx: t.metrics.columnGapPx,
    footnotes: {},
    splitTables: d.layout.splitTables,
    tableOrphans: d.layout.tableOrphans,
    splitLists: d.layout.splitLists,
    splitCode: d.layout.splitCode,
    codeOrphans: d.layout.codeOrphans,
    continuedLabel: d.labels.continued,
  };
}

/**
 * Breaks a flat list of rendered blocks into pages.
 *
 * The engine measures the real DOM inside an offscreen host that carries the
 * same template CSS as the final page, so what the preview shows is what the
 * print pipeline produces (P2). It never reflows or rewrites content — it only
 * decides where the boundaries fall (P1).
 *
 * The unit it fills is a **column**, not a page: with `columns: 1` a column is
 * the page, and with more the columns are grouped into pages afterwards. That
 * is why two-column layout here is real pagination rather than CSS
 * `column-count`, which cannot be measured or broken deterministically.
 *
 * `host` must be attached to the document; it is emptied and reused.
 */
export function paginate(
  blocks: readonly string[] | readonly Element[],
  options: PaginateOptions,
  host: HTMLElement,
): PaginateResult {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  const warnings: LayoutWarning[] = [];
  const pageOfNode: Record<string, number> = {};
  const columnsPerPage = Math.max(1, Math.round(options.columns));
  const columnWidth =
    columnsPerPage === 1
      ? options.contentWidthPx
      : (options.contentWidthPx - options.columnGapPx * (columnsPerPage - 1)) / columnsPerPage;

  host.textContent = '';
  host.style.position = 'absolute';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${options.contentWidthPx}px`;
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  host.setAttribute('aria-hidden', 'true');

  // The queue holds live elements; splitting pushes the remainder back on front.
  // Callers may hand over elements that are already in the document and whose
  // images have finished loading — measuring those is what makes the result
  // reproducible, because a fresh <img> built from a string reports height 0
  // until it has decoded.
  const queue: Element[] = [];
  if (blocks.length > 0 && typeof blocks[0] === 'string') {
    const staging = document.createElement('div');
    staging.innerHTML = (blocks as readonly string[]).join('');
    for (const child of Array.from(staging.children)) queue.push(child);
  } else {
    for (const el of blocks as readonly Element[]) queue.push(el);
  }

  const columns: string[] = [];
  /** Full-width band printed above the columns of a page (a title block). */
  const bandOfPage: string[] = [];
  let columnHeight = options.contentHeightPx;
  let column = newColumn(host, options, columnWidth, columnHeight);
  let columnIndex = 0;
  let guard = 0;
  const maxIterations = queue.length * 14 + 2000;

  const pageOfColumn = (index: number): number => Math.floor(index / columnsPerPage) + 1;

  const commitColumn = (padToPage = false): void => {
    columns.push(column.html());
    columnIndex++;
    if (padToPage) {
      while (columnIndex % columnsPerPage !== 0) {
        columns.push('');
        columnIndex++;
      }
    }
    // A new page starts with the full height again; a band, if any, shortens it.
    if (columnIndex % columnsPerPage === 0) columnHeight = options.contentHeightPx;
    column = newColumn(host, options, columnWidth, columnHeight);
  };

  /**
   * Lays a block across the whole text width above the columns — what a title
   * block does in a two-column paper. The band eats into the height every
   * column on that page gets, which is why it is measured before they are made.
   */
  const placeBand = (block: Element): void => {
    if (column.blockCount() > 0 || columnIndex % columnsPerPage !== 0) commitColumn(true);
    const probe = document.createElement('div');
    probe.className = 'sr-doc sr-span';
    probe.style.width = `${options.contentWidthPx}px`;
    // flow-root so the band's own margins are measured, not collapsed away —
    // the printed .sr-span uses the same rule, so the heights agree.
    probe.style.display = 'flow-root';
    host.appendChild(probe);
    probe.appendChild(block);
    const height = probe.getBoundingClientRect().height;
    const html = probe.innerHTML;
    probe.remove();

    const page = pageOfColumn(columnIndex) - 1;
    bandOfPage[page] = (bandOfPage[page] ?? '') + html;
    recordPage(block, page + 1, pageOfNode);
    columnHeight = Math.max(options.contentHeightPx * 0.2, options.contentHeightPx - height);
    column = newColumn(host, options, columnWidth, columnHeight);
  };

  while (queue.length) {
    if (++guard > maxIterations) {
      warnings.push({
        code: 'SR-L900',
        message:
          'Phân trang dừng sớm do vượt số vòng lặp an toàn. Bố cục hiển thị có thể chưa đầy đủ.',
        nodeId: null,
        line: null,
      });
      break;
    }

    const block = queue.shift() as Element;

    // A block that spans every column sits in a band above them.
    if (columnsPerPage > 1 && block.getAttribute('data-sr-span') === 'page') {
      placeBand(block);
      continue;
    }

    // An explicit break (a chapter heading, a front-matter section title) starts
    // a fresh PAGE — not merely a fresh column.
    if (block.getAttribute('data-sr-break') === 'page' && column.blockCount() > 0) {
      commitColumn(true);
    }

    column.append(block);

    if (!column.overflows()) {
      recordPage(block, pageOfColumn(columnIndex), pageOfNode);
      continue;
    }

    // ---- the block does not fit as-is -------------------------------------
    const type = block.getAttribute('data-sr-type') ?? '';
    const columnIsEmpty = column.blockCount() === 1;

    // ---- structural splits: table rows, list items -------------------------
    const structural = trySplitStructure(block, column, options);
    if (structural) {
      const [head, tail] = structural;
      column.replace(block, head);
      if (!column.overflows()) {
        recordPage(head, pageOfColumn(columnIndex), pageOfNode);
        queue.unshift(tail);
        commitColumn();
        continue;
      }
      column.replace(head, block);
    }

    const atomic = options.atomicTypes.includes(type) || !isSplittable(block);
    if (atomic) {
      if (columnIsEmpty) {
        // Nothing can be done: the object is taller than the text area.
        warnings.push({
          code: 'SR-L001',
          message: `Khối "${type || block.tagName.toLowerCase()}" cao hơn vùng nội dung của trang nên bị tràn.`,
          nodeId: block.getAttribute('data-sr-id'),
          line: numAttr(block, 'data-sr-line'),
        });
        recordPage(block, pageOfColumn(columnIndex), pageOfNode);
        commitColumn();
        continue;
      }
      column.remove(block);
      queue.unshift(block);
      carryHeadings(column, queue, options);
      commitColumn();
      continue;
    }

    // ---- try a line-level split -------------------------------------------
    const split = trySplit(block, column, options);
    if (split) {
      const [head, tail] = split;
      column.replace(block, head);
      // Verify the split against the freshly laid-out head rather than trusting
      // the pre-split measurement: reflow after truncation can move a line.
      if (lineBoxes(head).length >= options.orphans && !column.overflows()) {
        recordPage(head, pageOfColumn(columnIndex), pageOfNode);
        queue.unshift(tail);
        commitColumn();
        continue;
      }
      column.replace(head, block);
    }

    if (columnIsEmpty) {
      warnings.push({
        code: 'SR-L002',
        message: 'Một đoạn văn dài hơn một trang nhưng không thể cắt theo dòng.',
        nodeId: block.getAttribute('data-sr-id'),
        line: numAttr(block, 'data-sr-line'),
      });
      recordPage(block, pageOfColumn(columnIndex), pageOfNode);
      commitColumn();
      continue;
    }

    column.remove(block);
    queue.unshift(block);
    carryHeadings(column, queue, options);
    commitColumn();
  }

  if (column.blockCount() || !columns.length) {
    columns.push(column.html());
    columnIndex++;
  }
  while (columnIndex % columnsPerPage !== 0) {
    columns.push('');
    columnIndex++;
  }
  host.textContent = '';

  const pages: string[] = [];
  if (columnsPerPage === 1) {
    pages.push(...columns);
  } else {
    for (let i = 0; i < columns.length; i += columnsPerPage) {
      const group = columns.slice(i, i + columnsPerPage);
      const band = bandOfPage[i / columnsPerPage] ?? '';
      pages.push(
        `${band ? `<div class="sr-span">${band}</div>` : ''}` +
          `<div class="sr-columns" style="--sr-columns:${columnsPerPage}">${group
            .map((c) => `<div class="sr-column">${c}</div>`)
            .join('')}</div>`,
      );
    }
  }

  return {
    pages,
    warnings,
    pageOfNode,
    durationMs:
      Math.round(((typeof performance !== 'undefined' ? performance.now() : 0) - started) * 100) /
      100,
  };
}

/* ------------------------------------------------------------------ column */

interface Column {
  /** The measured box: blocks plus the footnote list under them. */
  box: HTMLElement;
  append(block: Element): void;
  replace(from: Element, to: Element): void;
  remove(block: Element): void;
  lastBlock(): Element | null;
  blockCount(): number;
  overflows(): boolean;
  /** Bottom coordinate a block may reach, footnotes already deducted. */
  limitBottom(): number;
  html(): string;
}

/**
 * One column of one page.
 *
 * Footnotes belong to the column they are referenced from: with one column that
 * is the familiar "notes at the foot of the page", and with two it matches what
 * two-column journals do. The note list is rebuilt from the references actually
 * present after every change, so a paragraph that gets split carries only the
 * notes that stayed with it.
 *
 * The notes sit in normal flow here, directly after the blocks, so their height
 * counts towards the overflow test. The printed page pins the same list to the
 * bottom with absolute positioning — same height, same content, so what is
 * measured is what is printed (P2).
 */
function newColumn(
  host: HTMLElement,
  options: PaginateOptions,
  width: number,
  height: number,
): Column {
  const box = document.createElement('div');
  box.className = 'sr-doc sr-measure-page';
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  box.style.overflow = 'hidden';

  const notes = document.createElement('ol');
  notes.className = 'sr-footnotes';
  notes.hidden = true;
  box.appendChild(notes);

  host.textContent = '';
  host.appendChild(box);

  const hasNotes = Object.keys(options.footnotes).length > 0;
  const blocks = (): Element[] => Array.from(box.children).filter((c) => c !== notes);

  const sync = (): void => {
    box.appendChild(notes); // the notes are always the last child
    if (!hasNotes) return;
    const seen: string[] = [];
    for (const ref of Array.from(box.querySelectorAll('[data-sr-fn]'))) {
      const n = ref.getAttribute('data-sr-fn');
      if (n && options.footnotes[n] && !seen.includes(n)) seen.push(n);
    }
    const html = seen.map((n) => options.footnotes[n]).join('');
    if (notes.innerHTML !== html) notes.innerHTML = html;
    notes.hidden = seen.length === 0;
  };

  return {
    box,
    append(block) {
      box.insertBefore(block, notes);
      sync();
    },
    replace(from, to) {
      box.replaceChild(to, from);
      sync();
    },
    remove(block) {
      block.remove();
      sync();
    },
    lastBlock: () => {
      const list = blocks();
      return list.length ? (list[list.length - 1] as Element) : null;
    },
    blockCount: () => blocks().length,
    overflows: () => box.scrollHeight > height + 0.5,
    limitBottom: () => {
      const bottom = box.getBoundingClientRect().top + height;
      const notesHeight = notes.hidden ? 0 : notes.getBoundingClientRect().height;
      return bottom - notesHeight;
    },
    html: () => {
      const body = blocks()
        .map((el) => el.outerHTML)
        .join('');
      const foot =
        notes.hidden || !notes.innerHTML ? '' : `<ol class="sr-footnotes">${notes.innerHTML}</ol>`;
      return body + foot;
    },
  };
}

/* ------------------------------------------------------------------ helpers */

function recordPage(el: Element, pageIndex: number, map: Record<string, number>): void {
  const id = el.getAttribute('data-sr-id');
  if (id && map[id] === undefined) map[id] = pageIndex;
  for (const child of Array.from(el.querySelectorAll('[data-sr-id]'))) {
    const cid = child.getAttribute('data-sr-id');
    if (cid && map[cid] === undefined) map[cid] = pageIndex;
  }
}

/**
 * Moves trailing headings onto the next column so they stay with the content
 * they introduce. A run of headings (`# 2` immediately followed by `## 2.1`) is
 * carried as a whole, and in source order.
 *
 * The column is never emptied — a heading alone is better than an empty page.
 */
function carryHeadings(column: Column, queue: Element[], options: PaginateOptions): void {
  if (!options.keepHeadingWithNext) return;
  while (column.blockCount() > 1) {
    const last = column.lastBlock();
    if (!last || last.getAttribute('data-sr-type') !== 'heading') break;
    column.remove(last);
    queue.unshift(last);
  }
}

function trySplitStructure(
  block: Element,
  column: Column,
  options: PaginateOptions,
): [Element, Element] | null {
  const limit = column.limitBottom();
  if (options.splitTables && isTable(block)) {
    return splitTable(block, limit, Math.max(1, options.tableOrphans), options.continuedLabel);
  }
  if (options.splitLists && isList(block)) {
    return splitList(block, limit, 1);
  }
  if (options.splitCode && isCode(block)) {
    return splitCodeBlock(block, limit, Math.max(1, options.codeOrphans), options.continuedLabel);
  }
  return null;
}

function trySplit(
  block: Element,
  column: Column,
  options: PaginateOptions,
): [Element, Element] | null {
  const limitBottom = column.limitBottom();
  const lines = lineBoxes(block);
  if (lines.length < options.orphans + options.widows) return null;

  let fit = 0;
  for (const line of lines) {
    if (line.bottom <= limitBottom + 0.5) fit++;
    else break;
  }
  if (fit < options.orphans) return null;
  if (lines.length - fit < options.widows) fit = lines.length - options.widows;
  if (fit < options.orphans || fit <= 0 || fit >= lines.length) return null;

  const rawOffset = offsetAtLineStart(block, fit);
  if (rawOffset <= 0) return null;
  const offset = snapToWord(block, rawOffset);
  const parts = splitElementAt(block, offset);
  if (!parts) return null;

  const [head, tail] = parts;
  head.setAttribute('data-sr-split', 'head');
  tail.setAttribute('data-sr-split', 'tail');
  tail.classList.remove('sr-first-paragraph');
  if (tail instanceof HTMLElement) tail.style.textIndent = '0';
  for (const el of Array.from(tail.querySelectorAll('[data-sr-id]'))) {
    el.removeAttribute('data-sr-id');
  }
  return [head, tail];
}

function numAttr(el: Element, name: string): number | null {
  const v = el.getAttribute(name);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Checks the finished body against the page count the faculty asks for.
 * Reported, never enforced: the engine does not pad or squeeze a document to
 * hit a number (P1).
 */
export function checkPageBudget(
  bodyPages: number,
  budget: { min: number; max: number } | null,
): LayoutWarning[] {
  if (!budget) return [];
  if (bodyPages < budget.min) {
    return [
      {
        code: 'SR-L010',
        message: `Phần nội dung có ${bodyPages} trang, ít hơn mức ${budget.min}–${budget.max} trang mà quy cách yêu cầu.`,
        nodeId: null,
        line: null,
      },
    ];
  }
  if (bodyPages > budget.max) {
    return [
      {
        code: 'SR-L011',
        message: `Phần nội dung có ${bodyPages} trang, vượt mức ${budget.min}–${budget.max} trang mà quy cách yêu cầu.`,
        nodeId: null,
        line: null,
      },
    ];
  }
  return [];
}

export { lineBoxes, clusterRects, isSplittable } from './split.js';
export type { LineBox } from './split.js';
