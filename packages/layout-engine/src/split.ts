/**
 * Splitting a rendered block at a line boundary.
 *
 * The layout engine works on real DOM boxes, not on estimates: it asks the
 * browser where the line boxes actually are, then cuts the element at the
 * character offset that starts the first line which does not fit. Elements the
 * cut must not land inside (rendered maths, inline code, links, sup/sub) are
 * treated as single indivisible units.
 */

/** Elements whose internals must never be cut. */
const ATOMIC_INLINE = new Set(['CODE', 'SUP', 'SUB', 'BR', 'IMG', 'SVG']);

function isAtomic(el: Element): boolean {
  if (ATOMIC_INLINE.has(el.tagName)) return true;
  return el.classList.contains('katex') || el.classList.contains('sr-math-error');
}

export interface LineBox {
  top: number;
  bottom: number;
}

/**
 * Groups client rects into visual lines.
 *
 * Naive grouping by `top` is wrong: an inline KaTeX span, a `sup`/`sub`, or a
 * larger inline font sits at a different top than the surrounding text on the
 * very same line, and would be counted as an extra line — which silently breaks
 * orphan/widow control. Rects are therefore clustered by vertical overlap.
 */
export function clusterRects(rects: DOMRect[]): LineBox[] {
  const usable = rects
    .filter((r) => r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: LineBox[] = [];
  for (const r of usable) {
    const last = lines[lines.length - 1];
    if (last) {
      const overlap = Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top);
      const smaller = Math.min(last.bottom - last.top, r.bottom - r.top);
      if (smaller > 0 && overlap > smaller * 0.5) {
        last.top = Math.min(last.top, r.top);
        last.bottom = Math.max(last.bottom, r.bottom);
        continue;
      }
    }
    lines.push({ top: r.top, bottom: r.bottom });
  }
  return lines;
}

/** Visual line boxes of an element, top to bottom. */
export function lineBoxes(el: Element): LineBox[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = clusterRects(Array.from(range.getClientRects()));
  range.detach?.();
  return lines;
}

/** Total text length, counting atomic inline elements as their text length. */
export function textLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue?.length ?? 0;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  const el = node as Element;
  if (isAtomic(el)) return Math.max(1, el.textContent?.length ?? 1);
  let n = 0;
  for (const child of Array.from(el.childNodes)) n += textLength(child);
  return n;
}

/**
 * How many visual lines are covered by the first `offset` characters of `el`.
 * Used to binary-search the character that starts a given line.
 */
function linesCoveredUpTo(el: Element, offset: number): number {
  const range = document.createRange();
  range.setStart(el, 0);
  const end = locate(el, offset);
  if (!end) return 0;
  try {
    range.setEnd(end.node, end.offset);
  } catch {
    return 0;
  }
  return clusterRects(Array.from(range.getClientRects())).length;
}

interface Located {
  node: Node;
  offset: number;
}

/** Maps a global character offset to a (textNode, offset) pair. */
function locate(root: Node, target: number): Located | null {
  let remaining = target;
  let result: Located | null = null;

  const visit = (node: Node): boolean => {
    if (result) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0;
      if (remaining <= len) {
        result = { node, offset: remaining };
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    if (isAtomic(el)) {
      const len = Math.max(1, el.textContent?.length ?? 1);
      if (remaining <= 0) {
        const parent = el.parentNode;
        if (parent) {
          result = { node: parent, offset: Array.from(parent.childNodes).indexOf(el) };
          return true;
        }
      }
      remaining -= len;
      return false;
    }
    for (const child of Array.from(el.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  };

  visit(root);
  return result;
}

/**
 * Finds the character offset that begins line `lineIndex` (0-based) of `el`.
 * Returns -1 when the boundary cannot be determined.
 */
export function offsetAtLineStart(el: Element, lineIndex: number): number {
  if (lineIndex <= 0) return 0;
  const total = textLength(el);
  let lo = 0;
  let hi = total;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (linesCoveredUpTo(el, mid) > lineIndex) hi = mid;
    else lo = mid + 1;
  }
  if (lo <= 0 || lo >= total) return -1;
  return lo;
}

/** Backs the offset up to the previous word boundary so words are not cut. */
export function snapToWord(el: Element, offset: number): number {
  const text = el.textContent ?? '';
  let i = Math.min(offset, text.length);
  const limit = Math.max(0, i - 80);
  while (i > limit && !/\s/.test(text[i - 1] as string)) i--;
  return i > 0 ? i : offset;
}

/**
 * Splits `el` at a global character offset. Returns a clone containing the
 * first part and a clone containing the rest. Neither shares nodes with `el`.
 */
export function splitElementAt(el: Element, offset: number): [Element, Element] | null {
  const head = el.cloneNode(true) as Element;
  const tail = el.cloneNode(true) as Element;
  if (!truncate(head, offset, 'head')) return null;
  if (!truncate(tail, offset, 'tail')) return null;
  if (!(head.textContent ?? '').trim() || !(tail.textContent ?? '').trim()) return null;
  return [head, tail];
}

/** Keeps either the first `offset` chars ("head") or everything after ("tail"). */
function truncate(root: Element, offset: number, mode: 'head' | 'tail'): boolean {
  let remaining = offset;
  let done = false;

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? '';
      if (done) {
        if (mode === 'head') node.nodeValue = '';
        return;
      }
      if (remaining >= value.length) {
        remaining -= value.length;
        if (mode === 'tail') node.nodeValue = '';
        if (remaining === 0) done = true;
        return;
      }
      if (mode === 'head') node.nodeValue = value.slice(0, remaining);
      else node.nodeValue = value.slice(remaining);
      remaining = 0;
      done = true;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (isAtomic(el)) {
      const len = Math.max(1, el.textContent?.length ?? 1);
      if (done) {
        if (mode === 'head') el.remove();
        return;
      }
      if (remaining >= len) {
        remaining -= len;
        if (mode === 'tail') el.remove();
        if (remaining === 0) done = true;
        return;
      }
      // Boundary lands inside an atomic element: push the whole element to the tail.
      if (mode === 'head') el.remove();
      remaining = 0;
      done = true;
      return;
    }
    for (const child of Array.from(el.childNodes)) visit(child);
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  return true;
}

export function isSplittable(el: Element): boolean {
  const type = el.getAttribute('data-sr-type');
  if (type === 'paragraph' || type === 'blockquote') return true;
  return el.tagName === 'P';
}

/* ----------------------------------------------- structural (row/item) splits */

/** The caption element of a table/figure wrapper, and where it sits. */
function captionOf(wrapper: Element): { el: Element; above: boolean } | null {
  const cap = wrapper.querySelector(':scope > .sr-caption');
  if (!cap) return null;
  return { el: cap, above: wrapper.firstElementChild === cap };
}

/**
 * Splits a table wrapper between two body rows, repeating the header on the
 * continuation. Returns null when neither side would keep `minRows` rows —
 * a table that would leave a single orphan row behind is moved whole instead.
 */
/**
 * For each body row, whether the table may be cut right after it — false when
 * a `rowspan` cell starting at or before that row still reaches into a later
 * row. A covered slot (see `TableCell.covered`) renders no `<td>` at all, so
 * this walks column occupancy the same way a browser lays the grid out: a row
 * short a cell in some column is exactly a row a span from above still owns.
 */
function computeRowSafety(rows: HTMLTableRowElement[], columns: number): boolean[] {
  const occupancy = new Array<number>(columns).fill(0);
  return rows.map((row) => {
    const cells = Array.from(row.cells);
    let cellIndex = 0;
    for (let col = 0; col < columns; col++) {
      if (occupancy[col] as number > 0) {
        (occupancy[col] as number)--;
        continue;
      }
      const cell = cells[cellIndex++];
      const rowSpan = cell ? Math.max(1, Number.parseInt(cell.getAttribute('rowspan') ?? '1', 10) || 1) : 1;
      const colSpan = cell ? Math.max(1, Number.parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1) : 1;
      if (rowSpan > 1) {
        for (let k = col; k < Math.min(columns, col + colSpan); k++) occupancy[k] = Math.max(occupancy[k] as number, rowSpan - 1);
      }
      if (colSpan > 1) col += colSpan - 1;
    }
    return occupancy.every((v) => v === 0);
  });
}

function stripContinuationSuffix(text: string, continuedLabel: string): string {
  const suffix = `(${continuedLabel})`.trim();
  if (!suffix) return text.trim();
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\s*${escaped}\\s*$`, 'i'), '').trim();
}

export function clearFragmentIdentity(fragment: Element): void {
  fragment.removeAttribute('id');
  fragment.removeAttribute('data-sr-id');
  fragment.removeAttribute('data-sr-block-id');
  for (const el of Array.from(fragment.querySelectorAll('[id],[data-sr-id],[data-sr-block-id]'))) {
    el.removeAttribute('id');
    el.removeAttribute('data-sr-id');
    el.removeAttribute('data-sr-block-id');
  }
}

export function splitTable(
  wrapper: Element,
  availableBottom: number,
  minRows: number,
  continuedLabel: string,
): [Element, Element] | null {
  const table = wrapper.querySelector('table');
  if (!table) return null;
  const body = table.querySelector('tbody');
  const rows = Array.from(body ? body.rows : table.rows).filter(
    (r) => r.parentElement?.tagName !== 'THEAD',
  );
  // The caller decides the minimum. This used to clamp to 2 unconditionally,
  // which quietly overrode `tableOrphans: 1` AND made the last-resort pass
  // below impossible: a two-row table whose first row already fills the page
  // could never be cut, so it overflowed the page box (content clipped by
  // `overflow:hidden` — real loss, not a display artefact) with only an
  // SR-L001 warning to show for it.
  const keepRows = Math.max(1, Math.trunc(minRows));
  if (rows.length < keepRows * 2) return null;

  const rowLogicalWidth = (row: HTMLTableRowElement): number =>
    Array.from(row.cells).reduce((sum, cell) => sum + Math.max(1, cell.colSpan || 1), 0);
  const headerRow = table.querySelector('thead tr') as HTMLTableRowElement | null;
  const columns = Math.max(
    headerRow ? rowLogicalWidth(headerRow) : 0,
    ...rows.map(rowLogicalWidth),
    1,
  );
  const safeAfter = computeRowSafety(rows, columns);

  let naturalFit = 0;
  for (const row of rows) {
    if (row.getBoundingClientRect().bottom <= availableBottom + 0.5) naturalFit++;
    else break;
  }
  let candidate = Math.min(naturalFit, rows.length - keepRows);
  if (candidate < keepRows) return null;

  const caption = captionOf(wrapper);

  const makeHead = (fit: number): Element => {
    const head = wrapper.cloneNode(true) as Element;
    const t = head.querySelector('table');
    const tb = t?.querySelector('tbody');
    const list = Array.from(tb ? tb.rows : t?.rows ?? []).filter(
      (r) => r.parentElement?.tagName !== 'THEAD',
    );
    list.forEach((row, index) => { if (index >= fit) row.remove(); });
    if (caption && !caption.above) head.querySelector(':scope > .sr-caption')?.remove();
    return head;
  };

  const measureHead = (fit: number): number | null => {
    const head = makeHead(fit);
    const parent = wrapper.parentElement;
    if (!parent) return null;
    parent.insertBefore(head, wrapper);
    const marginBottom = parseFloat(getComputedStyle(head).marginBottom) || 0;
    const bottom = head.getBoundingClientRect().bottom + marginBottom;
    head.remove();
    return Number.isFinite(bottom) ? bottom : null;
  };

  // The row rects are a fast first estimate, but the candidate clone is the
  // authoritative measurement: automatic table layout can change earlier row
  // heights once later rows are removed. The clone also includes border-spacing,
  // cell padding, caption and margins exactly as the real fragment will print.
  let fit = candidate;
  for (; fit >= keepRows; fit--) {
    if (!safeAfter[fit - 1]) continue;
    const bottom = measureHead(fit);
    if (bottom !== null && bottom <= availableBottom + 0.5) break;
  }
  if (fit < keepRows || rows.length - fit < keepRows) return null;

  const head = makeHead(fit);
  const tail = wrapper.cloneNode(true) as Element;
  const t = tail.querySelector('table');
  const tb = t?.querySelector('tbody');
  const list = Array.from(tb ? tb.rows : t?.rows ?? []).filter(
    (r) => r.parentElement?.tagName !== 'THEAD',
  );
  list.forEach((row, index) => { if (index < fit) row.remove(); });

  const cap = captionOf(wrapper);
  const headCap = captionOf(head);
  const tailCap = captionOf(tail);
  if (cap) {
    if (!cap.above) headCap?.el.remove();
    if (tailCap) {
      const base = stripContinuationSuffix(tailCap.el.textContent ?? '', continuedLabel);
      tailCap.el.textContent = base ? `${base} (${continuedLabel})` : `(${continuedLabel})`;
    }
  }

  const headRows = Array.from(head.querySelectorAll('tbody tr')).length;
  const tailRows = Array.from(tail.querySelectorAll('tbody tr')).length;
  const sourceRows = rows.length;
  // Conservation invariant: every original row exists in exactly one fragment.
  // Checked on the *built* fragments, not on the arithmetic that produced them,
  // so a clone that lost a row to a selector mismatch is caught here and the
  // whole split is abandoned rather than shipping a table with a hole in it.
  // Relaxing `keepRows` above never relaxes this.
  if (headRows !== fit || tailRows !== sourceRows - fit || headRows + tailRows !== sourceRows) return null;

  clearFragmentIdentity(tail);
  head.setAttribute('data-sr-split', 'head');
  tail.setAttribute('data-sr-split', 'tail');
  tail.setAttribute('data-sr-continuation', '1');
  tail.setAttribute('data-sr-remaining-rows', String(tailRows));
  return [head, tail];
}

/** Splits a list between two items, renumbering the continuation of an `<ol>`. */
export function splitList(
  list: Element,
  availableBottom: number,
  minItems: number,
): [Element, Element] | null {
  const items = Array.from(list.children).filter((c) => c.tagName === 'LI');
  if (items.length < minItems * 2) return null;

  let fit = 0;
  for (const item of items) {
    if (item.getBoundingClientRect().bottom <= availableBottom + 0.5) fit++;
    else break;
  }
  if (fit < minItems || items.length - fit < minItems) return null;

  const head = list.cloneNode(true) as Element;
  const tail = list.cloneNode(true) as Element;
  const keep = (clone: Element, pred: (index: number) => boolean): void => {
    Array.from(clone.children)
      .filter((c) => c.tagName === 'LI')
      .forEach((li, index) => {
        if (!pred(index)) li.remove();
      });
  };
  keep(head, (i) => i < fit);
  keep(tail, (i) => i >= fit);

  if (tail.tagName === 'OL') {
    const start = Number(list.getAttribute('start') ?? '1') || 1;
    tail.setAttribute('start', String(start + fit));
  }
  clearFragmentIdentity(tail);
  head.setAttribute('data-sr-split', 'head');
  tail.setAttribute('data-sr-split', 'tail');
  return [head, tail];
}

export function isCode(el: Element): boolean {
  return el.getAttribute('data-sr-type') === 'codeBlock' && !!el.querySelector('pre > code');
}

/**
 * Splits a fenced code block between two source lines. The gutter's line
 * numbers carry over unchanged (21, 22, … on the continuation, never
 * restarting at 1), and the caption is marked "(tiếp theo)" the same way
 * `splitTable` marks a carried-over table.
 *
 * The cut point is found from the *source* text, never from rendered line
 * boxes: a line the template wraps (`code.wrap`) renders as more than one
 * visual row, which would throw a visual-line count off by exactly the
 * amount that matters — a source-line boundary is the one thing that stays
 * correct whether or not lines wrap. Fit is found by actually rendering each
 * candidate line count and reading its height back (same principle as
 * `splitTable`'s row scan); height is monotonic in line count, so a binary
 * search converges in O(log n) reflows instead of one per line.
 */
/** Removes a single leading "\n" from the first non-empty text node of `root`, in document order. */
function trimLeadingNewline(root: Element): void {
  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? '';
      if (value.length === 0) return false;
      if (value[0] === '\n') node.nodeValue = value.slice(1);
      return true;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    for (const child of Array.from(node.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  };
  visit(root);
}

export function splitCodeBlock(
  wrapper: Element,
  availableBottom: number,
  minLines: number,
  continuedLabel: string,
): [Element, Element] | null {
  const pre = wrapper.querySelector('pre');
  const code = pre?.querySelector('code');
  if (!pre || !code) return null;

  const sourceLines = (code.textContent ?? '').split('\n');
  const total = sourceLines.length;
  if (total < minLines * 2) return null;

  // Offset of the character right after line n's own content — deliberately
  // NOT counting the newline that follows it. That separator belongs to
  // neither side on its own (splitting text always drops the one character
  // at the cut), so it is stripped from the tail's leading edge below
  // instead of being left dangling on the head's trailing edge.
  const offsetAfterLine = (n: number): number =>
    sourceLines.slice(0, n).reduce((sum, l) => sum + l.length, 0) + Math.max(0, n - 1);

  const gutter = wrapper.querySelector('.sr-code-gutter');
  const gutterLines = gutter ? (gutter.textContent ?? '').split('\n') : null;

  const parent = wrapper.parentElement;
  if (!parent) return null;

  /** Renders the wrapper keeping only the first `n` code lines; returns its bottom, or null if unmeasurable. */
  const bottomWith = (n: number): number | null => {
    const parts = splitElementAt(code, offsetAfterLine(n));
    if (!parts) return null;
    const clone = wrapper.cloneNode(true) as Element;
    const cloneCode = clone.querySelector('pre > code');
    if (!cloneCode?.parentNode) return null;
    cloneCode.parentNode.replaceChild(parts[0], cloneCode);
    if (gutterLines) {
      const cloneGutter = clone.querySelector('.sr-code-gutter');
      if (cloneGutter) cloneGutter.textContent = gutterLines.slice(0, n).join('\n');
    }
    parent.insertBefore(clone, wrapper);
    // getBoundingClientRect() stops at the border box — it excludes margin.
    // `parent` (the column box) has overflow:hidden, which establishes a new
    // block formatting context and therefore *traps* this wrapper's own
    // bottom margin as part of the column's scrollHeight instead of letting
    // it collapse away — exactly the quantity `column.overflows()` checks
    // against. Omitting it here made the probe measure ~10pt short and
    // accept splits that still overflowed once actually applied.
    const marginBottom = parseFloat(getComputedStyle(clone).marginBottom) || 0;
    const bottom = clone.getBoundingClientRect().bottom + marginBottom;
    clone.remove();
    return bottom;
  };

  const rangeLo = minLines;
  const rangeHi = total - minLines;
  if (rangeLo > rangeHi) return null;
  const floorBottom = bottomWith(rangeLo);
  if (floorBottom === null || floorBottom > availableBottom + 0.5) return null;

  let lo = rangeLo;
  let hi = rangeHi;
  while (lo < hi) {
    const mid = lo + 1 + Math.floor((hi - lo) / 2); // biased high: find the largest n that fits
    const bottom = bottomWith(mid);
    if (bottom !== null && bottom <= availableBottom + 0.5) lo = mid;
    else hi = mid - 1;
  }
  const fit = lo;
  if (fit < minLines || total - fit < minLines) return null;

  const parts = splitElementAt(code, offsetAfterLine(fit));
  if (!parts) return null;
  const [codeHead, codeTail] = parts;
  // The separator newline between line `fit` and `fit + 1` was excluded from
  // the head (see offsetAfterLine above), so it survives as a leading
  // character on the tail — strip it so the tail starts clean at line
  // `fit + 1` instead of with a blank first line.
  trimLeadingNewline(codeTail);

  const head = wrapper.cloneNode(true) as Element;
  const tail = wrapper.cloneNode(true) as Element;
  const swap = (clone: Element, replacement: Element): boolean => {
    const target = clone.querySelector('pre > code');
    if (!target?.parentNode) return false;
    target.parentNode.replaceChild(replacement, target);
    return true;
  };
  if (!swap(head, codeHead) || !swap(tail, codeTail)) return null;

  if (gutterLines) {
    const headGutter = head.querySelector('.sr-code-gutter');
    const tailGutter = tail.querySelector('.sr-code-gutter');
    if (headGutter) headGutter.textContent = gutterLines.slice(0, fit).join('\n');
    if (tailGutter) tailGutter.textContent = gutterLines.slice(fit).join('\n');
  }

  const cap = captionOf(wrapper);
  const headCap = captionOf(head);
  const tailCap = captionOf(tail);
  if (cap?.above) {
    if (tailCap) {
      const base = stripContinuationSuffix(tailCap.el.textContent ?? '', continuedLabel);
      tailCap.el.textContent = base ? `${base} (${continuedLabel})` : `(${continuedLabel})`;
    }
  } else if (cap) {
    headCap?.el.remove();
  }

  clearFragmentIdentity(tail);
  head.setAttribute('data-sr-split', 'head');
  tail.setAttribute('data-sr-split', 'tail');
  return [head, tail];
}

export function isTable(el: Element): boolean {
  return el.getAttribute('data-sr-type') === 'table' && !!el.querySelector('table');
}

export function isList(el: Element): boolean {
  const type = el.getAttribute('data-sr-type');
  return (type === 'list' || el.tagName === 'UL' || el.tagName === 'OL') &&
    (el.tagName === 'UL' || el.tagName === 'OL');
}
