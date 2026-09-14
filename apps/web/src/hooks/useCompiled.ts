import { useEffect, useMemo, useState } from 'react';
import { track } from '@scirender/telemetry';
import { compile, type CompileResult } from '~/lib/pipeline';
import { useStore } from '~/state/store';
import { useDebounced } from './useDebounced';

export interface CompileState {
  result: CompileResult | null;
  error: string | null;
  stale: boolean;
}

/**
 * Runs the compiler on a debounced copy of the source.
 *
 * A compiler crash is caught and surfaced rather than blanking the preview —
 * the last good result stays on screen and the failure is shown in full (P6).
 */
export function useCompiled(): CompileState {
  const source = useStore((s) => s.source);
  const templateId = useStore((s) => s.templateId);
  const overrides = useStore((s) => s.overrides);
  const assetMap = useStore((s) => s.assetMap);

  const debouncedSource = useDebounced(source, 180);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CompileResult | null>(null);

  const result = useMemo(() => {
    try {
      const out = compile({
        source: debouncedSource,
        templateId,
        overrides,
        assets: assetMap,
      });
      setError(null);
      return out;
    } catch (err) {
      setError((err as Error).stack ?? (err as Error).message);
      return null;
    }
  }, [debouncedSource, templateId, overrides, assetMap]);

  useEffect(() => {
    if (result) setLast(result);
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const total = result.timings.reduce((a, t) => a + t.ms, 0);
    track('compile', {
      ms: total,
      blocks: result.blocks.length,
      errors: result.diagnostics.filter((d) => d.severity === 'error').length,
      warnings: result.diagnostics.filter((d) => d.severity === 'warning').length,
      score: result.health.score,
      words: result.health.stats.words,
    });
  }, [result?.signature]);

  return {
    result: result ?? last,
    error,
    stale: debouncedSource !== source,
  };
}
