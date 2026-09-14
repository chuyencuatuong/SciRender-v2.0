/**
 * P7 — Research by Consent.
 *
 * This layer is deliberately isolated from every other package: nothing in the
 * pipeline imports it, and it imports nothing from the pipeline. It is OFF by
 * default, it never transmits anything anywhere, and every event it records
 * stays in the user's own browser until the user exports it themselves.
 *
 * Turning it on is an explicit, reversible act. Turning it off deletes what was
 * collected.
 */

export interface TelemetryEvent {
  /** Monotonic index within the session — no wall-clock timestamp is stored. */
  seq: number;
  /** Milliseconds since the session started, rounded to 100ms buckets. */
  tMs: number;
  name: string;
  /** Numeric, non-identifying measurements only. Enforced at write time. */
  data: Record<string, number | string | boolean>;
}

export interface TelemetryState {
  enabled: boolean;
  events: TelemetryEvent[];
  startedAt: number;
}

const STORAGE_KEY = 'scirender.research.v1';
const MAX_EVENTS = 2000;

/** Keys that are never recorded, whatever a caller passes. */
const BLOCKED_KEYS = new Set([
  'title', 'source', 'text', 'content', 'author', 'authors', 'email',
  'abstract', 'keywords', 'filename', 'path', 'url', 'value',
]);

let state: TelemetryState = { enabled: false, events: [], startedAt: 0 };

export function initTelemetry(enabled: boolean): void {
  state = {
    enabled,
    events: enabled ? loadEvents() : [],
    startedAt: enabled ? Date.now() : 0,
  };
}

export function isEnabled(): boolean {
  return state.enabled;
}

/** Opting in starts an empty session; opting out erases everything collected. */
export function setEnabled(enabled: boolean): void {
  if (enabled === state.enabled) return;
  if (enabled) {
    state = { enabled: true, events: [], startedAt: Date.now() };
    persist();
  } else {
    state = { enabled: false, events: [], startedAt: 0 };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }
}

export function track(name: string, data: Record<string, unknown> = {}): void {
  if (!state.enabled) return;
  const clean: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    if (BLOCKED_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === 'number') clean[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') clean[k] = v;
    else if (typeof v === 'string' && v.length <= 32 && !/\s/.test(v)) clean[k] = v;
  }
  state.events.push({
    seq: state.events.length + 1,
    tMs: Math.round((Date.now() - state.startedAt) / 100) * 100,
    name,
    data: clean,
  });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  persist();
}

export function getEvents(): TelemetryEvent[] {
  return state.enabled ? [...state.events] : [];
}

export function clearEvents(): void {
  state.events = [];
  persist();
}

/** The only way data ever leaves the browser: the user saves the file. */
export function exportEvents(): string {
  return JSON.stringify(
    {
      format: 'scirender-research',
      version: 1,
      note: 'Dữ liệu do người dùng chủ động xuất. Không chứa nội dung tài liệu.',
      events: getEvents(),
    },
    null,
    2,
  );
}

function persist(): void {
  if (!state.enabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  } catch {
    /* storage full — research data is expendable by design */
  }
}

function loadEvents(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}
