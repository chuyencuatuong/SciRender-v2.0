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
