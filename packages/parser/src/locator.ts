import type { Point, Position } from '@scirender/ast';

/**
 * Maps an offset inside a chunk of text back to an absolute source Point.
 * Precomputes line starts so the mapping is O(log n) instead of O(n).
 */
export class Locator {
  private readonly lineStarts: number[];

  constructor(
    private readonly text: string,
    private readonly base: Point,
  ) {
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
    }
  }

  at(offset: number): Point {
    const off = Math.max(0, Math.min(offset, this.text.length));
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.lineStarts[mid] ?? 0) <= off) lo = mid;
      else hi = mid - 1;
    }
    const lineStart = this.lineStarts[lo] ?? 0;
    return {
      line: this.base.line + lo,
      column: (lo === 0 ? this.base.column : 1) + (off - lineStart),
      offset: this.base.offset + off,
    };
  }

  span(start: number, end: number): Position {
    return { start: this.at(start), end: this.at(end) };
  }
}
