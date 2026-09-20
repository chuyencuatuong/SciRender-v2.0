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
  clearFragmentIdentity,
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

export type { PageOrientation } from '@scirender/ast';
import type { PageOrientation } from '@scirender/ast';

export interface PaginateResult {
  /** Inner HTML of each page body, in order. */
  pages: string[];
  /** Orientation for each page; body pages opt into landscape per block. */
  pageOrientations: PageOrientation[];
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
  host.style.width = `${Math.max(options.contentWidthPx, options.contentHeightPx)}px`;
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
  const columnOrientations: PageOrientation[] = [];
  /** Full-width band printed above the columns of a page (a title block). */
  const bandOfPage: string[] = [];
  const portraitWidth = options.contentWidthPx;
  const portraitHeight = options.contentHeightPx;
  const landscapeWidth = options.contentHeightPx;
  const landscapeHeight = options.contentWidthPx;
  const pageWidth = (orientation: PageOrientation): number =>
    orientation === 'landscape' ? landscapeWidth : portraitWidth;
  const pageHeight = (orientation: PageOrientation): number =>
    orientation === 'landscape' ? landscapeHeight : portraitHeight;
  const widthForColumns = (orientation: PageOrientation): number => {
    const width = pageWidth(orientation);
    return columnsPerPage === 1
      ? width
      : (width - options.columnGapPx * (columnsPerPage - 1)) / columnsPerPage;
  };

  let orientation: PageOrientation = 'portrait';
  let columnHeight = pageHeight(orientation);
  let column = newColumn(host, options, widthForColumns(orientation), columnHeight);
  let columnIndex = 0;
  let guard = 0;
  const maxIterations = queue.length * 14 + 2000;

  const pageOfColumn = (index: number): number => Math.floor(index / columnsPerPage) + 1;

  const commitColumn = (padToPage = false): void => {
    columns.push(column.html());
    columnOrientations.push(orientation);
    columnIndex++;
    if (padToPage) {
      while (columnIndex % columnsPerPage !== 0) {
        columns.push('');
        columnOrientations.push(orientation);
        columnIndex++;
      }
    }
    if (columnIndex % columnsPerPage === 0) {
      columnHeight = pageHeight(orientation);
    }
    column = newColumn(host, options, widthForColumns(orientation), columnHeight);
  };

  const setOrientation = (next: PageOrientation): void => {
    if (orientation === next) return;
    if (column.blockCount() > 0) commitColumn(true);
    orientation = next;
    columnHeight = pageHeight(orientation);
    column = newColumn(host, options, widthForColumns(orientation), columnHeight);
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
    probe.style.width = `${pageWidth(orientation)}px`;
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
    const currentHeight = pageHeight(orientation);
    columnHeight = Math.max(currentHeight * 0.2, currentHeight - height);
    column = newColumn(host, options, widthForColumns(orientation), columnHeight);
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

    const wantsLandscape = block.getAttribute('data-sr-landscape') === '1';
    setOrientation(wantsLandscape ? 'landscape' : 'portrait');

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
      if (wantsLandscape) commitColumn(true);
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
        const expectedRows = tableRowCount(block);
        const headRows = tableRowCount(head);
        const tailRows = tableRowCount(tail);
        const conserved =
          expectedRows == null ||
          (headRows != null && tailRows != null && headRows + tailRows === expectedRows);
        if (conserved) {
          recordPage(head, pageOfColumn(columnIndex), pageOfNode);
          // The tail is a first-class continuation. Keep it on the queue until
          // it has been fully consumed; never serialize a half-table and drop the remainder.
          queue.unshift(tail);
          commitColumn(wantsLandscape);
          continue;
        }
      }
      column.replace(head, block);
    }

    const atomic = options.atomicTypes.includes(type) || !isSplittable(block);
    if (atomic) {
      if (columnIsEmpty) {
        if (type === 'diagram' && fitOversizedDiagram(block, column.limitBottom())) {
          if (!column.overflows()) {
            recordPage(block, pageOfColumn(columnIndex), pageOfNode);
            commitColumn(wantsLandscape);
            continue;
          }
        }

        // The block owns an entire empty page and still overflows. Before
        // accepting the loss, retry the structural split with the orphan
        // minimums dropped to one unit per side: a table whose `tableOrphans`
        // is 2 cannot be cut at all when only one row fits, even though
        // cutting after one row would have kept every row on the page it
        // belongs to. This is the case a tall cell (a display formula, a long
        // wrapped paragraph inside a `<td>`) produces, and until now it fell
        // straight through to the warning below with the overflowing rows
        // clipped away by the page box's `overflow:hidden`.
        const rescued = trySplitStructure(block, column, options, true);
        if (rescued) {
          const [head, tail] = rescued;
          column.replace(block, head);
          if (!column.overflows()) {
            const expectedRows = tableRowCount(block);
            const headRows = tableRowCount(head);
            const tailRows = tableRowCount(tail);
            const conserved =
              expectedRows == null ||
              (headRows != null && tailRows != null && headRows + tailRows === expectedRows);
            if (conserved) {
              recordPage(head, pageOfColumn(columnIndex), pageOfNode);
              queue.unshift(tail);
              commitColumn(wantsLandscape);
              continue;
            }
          }
          column.replace(head, block);
        }

        // Nothing can be done: a single indivisible unit (one table row, one
        // figure, one equation) is taller than the text area.
        warnings.push({
          code: 'SR-L001',
          message: `Khối "${type || block.tagName.toLowerCase()}" cao hơn vùng nội dung của trang nên bị tràn.`,
          nodeId: block.getAttribute('data-sr-id'),
          line: numAttr(block, 'data-sr-line'),
        });
        recordPage(block, pageOfColumn(columnIndex), pageOfNode);
        commitColumn(wantsLandscape);
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
        commitColumn(wantsLandscape);
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
    columnOrientations.push(orientation);
    columnIndex++;
  }
  while (columnIndex % columnsPerPage !== 0) {
    columns.push('');
    columnOrientations.push(orientation);
    columnIndex++;
  }
  host.textContent = '';

  const pages: string[] = [];
  const pageOrientations: PageOrientation[] = [];
  if (columnsPerPage === 1) {
    pages.push(...columns);
    pageOrientations.push(...columnOrientations);
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
      pageOrientations.push(columnOrientations[i] ?? 'portrait');
    }
  }

  return {
    pages,
    pageOrientations,
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

function tableRowCount(block: Element): number | null {
  const table = block.querySelector('table');
  if (!table) return null;
  const body = table.querySelector('tbody');
  if (!body) return 0;
  return Array.from(body.rows).length;
}

function fitOversizedDiagram(block: Element, limitBottom: number): boolean {
  const visual = block.querySelector<HTMLElement>('.sr-mermaid > svg, .sr-diagram-asset');
  if (!visual) return false;
  const rect = visual.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  const blockRect = block.getBoundingClientRect();
  const computed = getComputedStyle(block);
  const marginBottom = parseFloat(computed.marginBottom) || 0;
  const paddingX = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
  const borderX = (parseFloat(computed.borderLeftWidth) || 0) + (parseFloat(computed.borderRightWidth) || 0);
  const maxVisualWidth = Math.max(0, block.clientWidth - paddingX - borderX);
  const nonVisualHeight = Math.max(0, blockRect.height - rect.height);
  const maxVisualHeight = Math.max(0, limitBottom - blockRect.top - nonVisualHeight - marginBottom);
  if (!(maxVisualHeight > 0)) return false;
  const scale = Math.min(1, maxVisualWidth > 0 ? maxVisualWidth / rect.width : 1, maxVisualHeight / rect.height);
  if (!(scale > 0 && scale < 1)) return false;
  const style = (visual as HTMLElement).style;
  style.width = `${Math.max(1, rect.width * scale)}px`;
  style.height = `${Math.max(1, rect.height * scale)}px`;
  style.maxWidth = 'none';
  style.aspectRatio = `${rect.width} / ${rect.height}`;
  block.setAttribute('data-sr-fit-scale', String(Math.round(scale * 1000) / 1000));
  return true;
}

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

/**
 * Splits a structural block (table rows, list items, code lines) at the column
 * boundary.
 *
 * `lastResort` is set only when the column is already empty — meaning the block
 * has a whole page to itself and *still* does not fit, so the alternative to
 * splitting is letting it overflow the page box and lose the overflowing rows
 * to `overflow:hidden`. In that situation the orphan/widow minimums are a
 * typographic preference standing in the way of not losing content, so they are
 * dropped to one unit per side. The conservation invariants inside
 * `splitTable` / `splitCodeBlock` are *not* relaxed: a split that cannot be
 * made safely still returns null and still ends in an SR-L001 warning.
 */
function trySplitStructure(
  block: Element,
  column: Column,
  options: PaginateOptions,
  lastResort = false,
): [Element, Element] | null {
  const limit = column.limitBottom();
  const floor = (configured: number): number => (lastResort ? 1 : Math.max(1, configured));
  if (options.splitTables && isTable(block)) {
    return splitTable(block, limit, floor(options.tableOrphans), options.continuedLabel);
  }
  if (options.splitLists && isList(block)) {
    return splitList(block, limit, 1);
  }
  if (options.splitCode && isCode(block)) {
    return splitCodeBlock(block, limit, floor(options.codeOrphans), options.continuedLabel);
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
  clearFragmentIdentity(tail);
  head.setAttribute('data-sr-split', 'head');
  tail.setAttribute('data-sr-split', 'tail');
  tail.classList.remove('sr-first-paragraph');
  if (tail instanceof HTMLElement) tail.style.textIndent = '0';
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
// `lineBoxes()` and `clusterRects()` both return `LineBox[]`, so a consumer
// could call them but could not name what came back. Exporting the splitting
// primitives as well lets a test (or a future column engine) reuse them
// instead of re-deriving a second, divergent implementation (P4).
export {
  isCode,
  isList,
  isTable,
  splitCodeBlock,
  splitElementAt,
  splitList,
  splitTable,
  clearFragmentIdentity,
  offsetAtLineStart,
  snapToWord,
  textLength,
} from './split.js';
export type { LineBox } from './split.js';
