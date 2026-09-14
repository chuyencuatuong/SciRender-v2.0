import type { ResolvedTemplate } from '@scirender/template-engine';
import {
  isSplittable,
  lineBoxes,
  offsetAtLineStart,
  snapToWord,
  splitElementAt,
} from './split.js';

export interface PaginateOptions {
  contentWidthPx: number;
  contentHeightPx: number;
  orphans: number;
  widows: number;
  keepHeadingWithNext: boolean;
  /** `data-sr-type` values that must never be split across pages. */
  atomicTypes: string[];
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
  return {
    contentWidthPx: t.metrics.contentWidthPx,
    contentHeightPx: t.metrics.contentHeightPx,
    orphans: t.descriptor.layout.orphans,
    widows: t.descriptor.layout.widows,
    keepHeadingWithNext: t.descriptor.layout.keepHeadingWithNext,
    atomicTypes: t.descriptor.layout.atomicBlocks,
  };
}

/**
 * Breaks a flat list of rendered blocks into pages.
 *
 * The engine measures the real DOM inside an offscreen host that carries the
 * same template CSS as the final page, so what the preview shows is what the
 * print pipeline produces (P2). It never reflows or rewrites content — it only
 * decides where the page boundaries fall (P1).
 *
 * `host` must be attached to the document; it is emptied and reused.
 */
export function paginate(
  blocks: string[],
  options: PaginateOptions,
  host: HTMLElement,
): PaginateResult {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  const warnings: LayoutWarning[] = [];
  const pageOfNode: Record<string, number> = {};

  host.textContent = '';
  host.style.position = 'absolute';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${options.contentWidthPx}px`;
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  host.setAttribute('aria-hidden', 'true');

  // The queue holds live elements; splitting pushes the remainder back on front.
  const queue: Element[] = [];
  const staging = document.createElement('div');
  staging.innerHTML = blocks.join('');
  for (const child of Array.from(staging.children)) queue.push(child);

  const pages: string[] = [];
  let page = newPage(host, options);
  let pageIndex = 1;
  let guard = 0;
  const maxIterations = queue.length * 12 + 2000;

  const commitPage = (): void => {
    pages.push(page.innerHTML);
    pageIndex++;
    page = newPage(host, options);
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
    page.appendChild(block);

    if (!overflows(page, options)) {
      recordPage(block, pageIndex, pageOfNode);
      continue;
    }

    // ---- the block does not fit as-is -------------------------------------
    const type = block.getAttribute('data-sr-type') ?? '';
    const atomic = options.atomicTypes.includes(type) || !isSplittable(block);
    const pageIsEmpty = page.children.length === 1;

    if (atomic) {
      if (pageIsEmpty) {
        // Nothing can be done: the object is taller than the text area.
        warnings.push({
          code: 'SR-L001',
          message: `Khối "${type || block.tagName.toLowerCase()}" cao hơn vùng nội dung của trang nên bị tràn.`,
          nodeId: block.getAttribute('data-sr-id'),
          line: numAttr(block, 'data-sr-line'),
        });
        recordPage(block, pageIndex, pageOfNode);
        commitPage();
        continue;
      }
      block.remove();
      queue.unshift(block);
      carryHeadings(page, queue, options);
      commitPage();
      continue;
    }

    // ---- try a line-level split -------------------------------------------
    const split = trySplit(block, page, options);
    if (split) {
      const [head, tail] = split;
      page.replaceChild(head, block);
      // Verify the split against the freshly laid-out head rather than trusting
      // the pre-split measurement: reflow after truncation can move a line.
      if (lineBoxes(head).length >= options.orphans && !overflows(page, options)) {
        recordPage(head, pageIndex, pageOfNode);
        queue.unshift(tail);
        commitPage();
        continue;
      }
      page.replaceChild(block, head);
    }

    if (pageIsEmpty) {
      warnings.push({
        code: 'SR-L002',
        message: 'Một đoạn văn dài hơn một trang nhưng không thể cắt theo dòng.',
        nodeId: block.getAttribute('data-sr-id'),
        line: numAttr(block, 'data-sr-line'),
      });
      recordPage(block, pageIndex, pageOfNode);
      commitPage();
      continue;
    }

    block.remove();
    queue.unshift(block);
    carryHeadings(page, queue, options);
    commitPage();
  }

  if (page.children.length || !pages.length) pages.push(page.innerHTML);
  host.textContent = '';

  return {
    pages,
    warnings,
    pageOfNode,
    durationMs: Math.round(
      ((typeof performance !== 'undefined' ? performance.now() : 0) - started) * 100,
    ) / 100,
  };
}

/* ------------------------------------------------------------------ helpers */

function newPage(host: HTMLElement, options: PaginateOptions): HTMLElement {
  const page = document.createElement('div');
  page.className = 'sr-doc sr-measure-page';
  page.style.width = `${options.contentWidthPx}px`;
  page.style.height = `${options.contentHeightPx}px`;
  page.style.overflow = 'hidden';
  host.textContent = '';
  host.appendChild(page);
  return page;
}

function overflows(page: HTMLElement, options: PaginateOptions): boolean {
  return page.scrollHeight > options.contentHeightPx + 0.5;
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
 * Moves trailing headings onto the next page so they stay with the content they
 * introduce. A run of headings (`# 2` immediately followed by `## 2.1`) is
 * carried as a whole, and in source order: each removal unshifts in front of the
 * previous one, so the queue ends up [H1, H2, block, ...].
 *
 * The page is never emptied — a heading alone is better than an empty page.
 */
function carryHeadings(page: HTMLElement, queue: Element[], options: PaginateOptions): void {
  if (!options.keepHeadingWithNext) return;
  while (page.children.length > 1) {
    const last = page.lastElementChild;
    if (!last || last.getAttribute('data-sr-type') !== 'heading') break;
    last.remove();
    queue.unshift(last);
  }
}

function trySplit(
  block: Element,
  page: HTMLElement,
  options: PaginateOptions,
): [Element, Element] | null {
  const pageRect = page.getBoundingClientRect();
  const limitBottom = pageRect.top + options.contentHeightPx;
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
  return [head, tail];
}

function numAttr(el: Element, name: string): number | null {
  const v = el.getAttribute(name);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export { lineBoxes, clusterRects, isSplittable } from './split.js';
export type { LineBox } from './split.js';
