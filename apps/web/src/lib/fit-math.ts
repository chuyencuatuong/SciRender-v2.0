export interface MathWarning {
  code: string;
  message: string;
  nodeId: string | null;
  line: number | null;
}

/**
 * Shrinks a display equation that is wider than the text block.
 *
 * KaTeX lays a formula out at its natural width and does not wrap. Inside a
 * fixed A4 column that means a long equation is simply cut off at the right
 * margin — the reader loses the end of it, and nothing in the app says so.
 * Here every display equation is measured against the column and scaled down
 * until it fits, before the layout engine measures anything, so the height used
 * for pagination is the height that gets printed (P2).
 *
 * Nothing is rewritten: the TeX is untouched and the same markup is scaled (P1).
 * If fitting would make the formula too small to read, the equation is left at
 * the readable limit and a warning is raised instead of hiding the problem (P6).
 */
export function fitDisplayMath(root: ParentNode, minScale = 0.62): MathWarning[] {
  const warnings: MathWarning[] = [];

  for (const display of Array.from(root.querySelectorAll<HTMLElement>('.katex-display'))) {
    const katex = display.querySelector<HTMLElement>('.katex');
    if (!katex) continue;

    // Reset anything a previous pass left behind so the measurement is clean.
    katex.style.transform = '';
    katex.style.transformOrigin = '';
    katex.style.marginLeft = '';
    display.style.height = '';
    display.style.overflow = '';

    const available = display.clientWidth;
    if (!available) continue;

    // As a block the element is exactly as wide as the column and the glyphs
    // spill out of it; as an inline-block it reports what the formula needs.
    katex.style.display = 'inline-block';
    const natural = Math.max(katex.scrollWidth, display.scrollWidth, katex.offsetWidth);
    const height = katex.offsetHeight;
    if (!natural || natural <= available + 0.5) {
      katex.style.display = '';
      continue;
    }

    let scale = Math.max(minScale, available / natural);

    // Scaling about the left edge and then re-centring by margin keeps the
    // arithmetic honest: a formula that overflows its line box is laid out from
    // the left, so a centre origin would slide the result sideways.
    const apply = (k: number): void => {
      katex.style.transformOrigin = 'left top';
      katex.style.transform = `scale(${k})`;
      katex.style.marginLeft = `${Math.max(0, (available - natural * k) / 2)}px`;
      display.style.height = `${Math.ceil(height * k)}px`;
      display.style.overflow = 'hidden';
    };
    apply(scale);

    // Trust the browser over the arithmetic: KaTeX uses absolute positioning
    // inside big operators, so the box can still poke out by a pixel or two.
    for (let pass = 0; pass < 3; pass++) {
      const box = katex.getBoundingClientRect();
      const host = display.getBoundingClientRect();
      const spill = Math.max(box.right - host.right, host.left - box.left);
      if (spill <= 0.5 || scale <= minScale) break;
      scale = Math.max(minScale, scale * (1 - Math.min(0.2, (spill + 1) / available)));
      apply(scale);
    }

    if (scale <= minScale + 0.001 && available / natural < minScale) {
      const block = display.closest<HTMLElement>('[data-sr-type="equation"]');
      warnings.push({
        code: 'SR-L004',
        message:
          `Công thức rộng hơn khổ giấy, phải thu còn ${Math.round(scale * 100)}% mới vừa nên sẽ khó đọc.`,
        nodeId: block?.getAttribute('data-sr-id') ?? null,
        line: Number(block?.getAttribute('data-sr-line')) || null,
      });
    }
  }

  return warnings;
}
