/**
 * Headless usage counters — the numbers, not the events.
 *
 * ## Why this is separate from the event log in `index.ts`
 *
 * The event log answers "what happened, in order". It is a growing array of up
 * to 2000 records, it is opt-in, and it is off by default, because a sequence
 * of timed actions is a behavioural trace even when each entry is harmless.
 *
 * This answers a different question: "how much has this tool been used" —
 * sessions started, documents rendered, pages produced. Those are the figures
 * worth putting in a CV or a report, and they are a *fixed-size* record of
 * integers. There is no sequence, no timing, no per-action trace, and nothing
 * derived from document content: a page count says how long a document was,
 * the same way a word count does, and says nothing about what it said.
 *
 * So the two layers get different defaults. The event log stays opt-in. The
 * counters are on unless switched off, because an always-empty counter is not
 * a privacy win — it is just a feature that never works — and the thing that
 * actually protects the user here is not consent theatre but the fact that
 * nothing ever leaves the machine. `@scirender/telemetry` has no network code
 * of any kind: not `fetch`, not `sendBeacon`, not an image ping. Read the
 * package. The only export path is `exportCounters()`, which returns a string
 * for the user to save themselves.
 *
 * ## Size
 *
 * Deliberately dependency-free and small: a handful of integers, one
 * localStorage key, no imports. It is loaded on the app's first paint, so it
 * must not cost anything measurable.
 */

/** A month bucket, `YYYY-MM`. Coarse on purpose: enough to plot a trend, not a diary. */
type MonthKey = string;

export interface UsageCounters {
  /** Schema version, so a future change can migrate rather than discard. */
  v: 1;
  /** `init()` calls — i.e. times the app was opened. */
  sessions: number;
  /** Renders that produced at least one page without a fatal error. */
  documentsRendered: number;
  /** Renders that ended in an error. Kept so the success rate is honest. */
  rendersFailed: number;
  /** Total pages across every successful render. Divide by `documentsRendered` for the mean. */
  pagesTotal: number;
  /** Largest single render, in pages. */
  pagesMax: number;
  /** Exports that reached the user as a file or a print dialog. */
  exports: number;
  /** `YYYY-MM` -> renders in that month. One small integer per month of use. */
  byMonth: Record<MonthKey, number>;
  /** `YYYY-MM-DD` of the first and most recent session. */
  firstUse: string;
  lastUse: string;
}

const KEY = 'scirender.usage.v1';
const OFF_KEY = 'scirender.usage.off';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function month(): MonthKey {
  return new Date().toISOString().slice(0, 7);
}

function blank(): UsageCounters {
  return {
    v: 1,
    sessions: 0,
    documentsRendered: 0,
    rendersFailed: 0,
    pagesTotal: 0,
    pagesMax: 0,
    exports: 0,
    byMonth: {},
    firstUse: today(),
    lastUse: today(),
  };
}

/** Counters are on unless the user turned them off. */
export function countersEnabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== '1';
  } catch {
    // Private mode, blocked storage: nothing can be counted anyway.
    return false;
  }
}

export function setCountersEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(OFF_KEY);
    else {
      localStorage.setItem(OFF_KEY, '1');
      localStorage.removeItem(KEY);
    }
  } catch {
    /* storage unavailable — nothing to switch */
  }
}

export function readCounters(): UsageCounters {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<UsageCounters>;
    // Every field is re-derived with a numeric fallback: a hand-edited or
    // half-written record must not be able to produce NaN in the UI.
    const base = blank();
    return {
      ...base,
      ...parsed,
      v: 1,
      sessions: num(parsed.sessions),
      documentsRendered: num(parsed.documentsRendered),
      rendersFailed: num(parsed.rendersFailed),
      pagesTotal: num(parsed.pagesTotal),
      pagesMax: num(parsed.pagesMax),
      exports: num(parsed.exports),
      byMonth: typeof parsed.byMonth === 'object' && parsed.byMonth ? parsed.byMonth : {},
      firstUse: typeof parsed.firstUse === 'string' ? parsed.firstUse : base.firstUse,
      lastUse: typeof parsed.lastUse === 'string' ? parsed.lastUse : base.lastUse,
    };
  } catch {
    return blank();
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function write(next: UsageCounters): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — counters are expendable by design */
  }
}

function update(mutate: (c: UsageCounters) => void): void {
  if (!countersEnabled()) return;
  const c = readCounters();
  mutate(c);
  c.lastUse = today();
  write(c);
}

/** Called once per app start. */
export function countSession(): void {
  update((c) => {
    c.sessions += 1;
  });
}

/**
 * Called after a render finishes.
 *
 * `pages` is the page count of the finished document. A render that threw
 * passes `null`, which counts as a failure and contributes nothing to the
 * averages — otherwise a broken document would quietly drag the mean down and
 * the "documents rendered" figure would stop meaning "documents that worked".
 */
export function countRender(pages: number | null): void {
  update((c) => {
    if (pages == null || pages <= 0) {
      c.rendersFailed += 1;
      return;
    }
    c.documentsRendered += 1;
    c.pagesTotal += pages;
    if (pages > c.pagesMax) c.pagesMax = pages;
    const m = month();
    c.byMonth[m] = (c.byMonth[m] ?? 0) + 1;
  });
}

/** Called when a document leaves the app: print dialog, HTML file, bundle. */
export function countExport(): void {
  update((c) => {
    c.exports += 1;
  });
}

export interface UsageSummary extends UsageCounters {
  /** Mean pages per successful render, one decimal. 0 when nothing rendered yet. */
  averagePages: number;
  /** Successful renders as a percentage of all render attempts. */
  successRate: number;
  /** Months with at least one render. */
  activeMonths: number;
}

export function summarise(c: UsageCounters = readCounters()): UsageSummary {
  const attempts = c.documentsRendered + c.rendersFailed;
  return {
    ...c,
    averagePages: c.documentsRendered
      ? Math.round((c.pagesTotal / c.documentsRendered) * 10) / 10
      : 0,
    successRate: attempts ? Math.round((c.documentsRendered / attempts) * 100) : 0,
    activeMonths: Object.keys(c.byMonth).length,
  };
}

export function resetCounters(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The only way these numbers leave the browser: the user saves the file. */
export function exportCounters(): string {
  return JSON.stringify(
    {
      format: 'scirender-usage',
      version: 1,
      note: 'Số liệu tổng hợp, không chứa nội dung tài liệu. Do người dùng chủ động xuất.',
      summary: summarise(),
    },
    null,
    2,
  );
}
