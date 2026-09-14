import type { Position } from './nodes.js';

export type Severity = 'error' | 'warning' | 'info';

/**
 * P6 — Fail Loudly. Every problem the pipeline notices becomes a Diagnostic
 * with a stable `code`, a source `position` and, when safe, a suggested fix
 * the user must apply themselves. SciRender never edits the source silently.
 */
export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  position: Position;
  /** Which stage raised it: parser | validator | equation | asset | template. */
  stage: string;
  nodeId?: string;
  hint?: string;
}

export function diagnostic(d: Diagnostic): Diagnostic {
  return d;
}

export function countBySeverity(list: Diagnostic[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of list) out[d.severity]++;
  return out;
}

/** Deterministic ordering: by line, then severity, then code. */
export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return [...list].sort(
    (a, b) =>
      a.position.start.line - b.position.start.line ||
      rank[a.severity] - rank[b.severity] ||
      a.code.localeCompare(b.code),
  );
}
