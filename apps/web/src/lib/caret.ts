/**
 * Where the caret is, in viewport pixels, inside a plain `<textarea>`.
 *
 * A textarea has no API for this — the classic workaround (used by every
 * editor that pops a menu under the caret in a bare textarea) is to mirror the
 * element into a hidden, identically-styled `<div>`, split its text at the
 * caret, and measure the marker span the mirror produces. Doing it against a
 * `<div>` rather than asking CSS to help means the result is exact even when
 * the text wraps.
 */
const MIRRORED_PROPS: Array<keyof CSSStyleDeclaration> = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'tabSize' as keyof CSSStyleDeclaration,
];

export interface CaretPoint {
  /** Viewport-relative, like `getBoundingClientRect()` — safe to use with a portal. */
  left: number;
  top: number;
  lineHeight: number;
}

export function caretViewportPosition(el: HTMLTextAreaElement, index: number): CaretPoint {
  const computed = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  const style = mirror.style;
  style.position = 'absolute';
  style.visibility = 'hidden';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.overflowWrap = 'break-word';
  style.top = '0';
  style.left = '-9999px';
  for (const prop of MIRRORED_PROPS) {
    const value = computed[prop];
    if (typeof value === 'string') (style as unknown as Record<string, string>)[prop as string] = value;
  }

  const before = document.createTextNode(el.value.slice(0, index));
  const marker = document.createElement('span');
  marker.textContent = el.value.slice(index) || '.';
  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const rect = el.getBoundingClientRect();
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
  const lineHeight = Number.parseFloat(computed.lineHeight) || marker.offsetHeight || 16;

  const point: CaretPoint = {
    left: rect.left + borderLeft + marker.offsetLeft - el.scrollLeft,
    top: rect.top + borderTop + marker.offsetTop - el.scrollTop,
    lineHeight,
  };

  document.body.removeChild(mirror);
  return point;
}
