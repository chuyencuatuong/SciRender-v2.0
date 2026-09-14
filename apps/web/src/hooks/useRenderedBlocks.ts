import { useEffect, useState } from 'react';
import { hasMermaid, resolveMermaidBlocks } from '~/lib/mermaid';

/**
 * Blocks ready for the layout engine: mermaid placeholders already replaced by
 * their SVG, so every block has its final height before pagination runs.
 */
export function useRenderedBlocks(blocks: string[], signature: string): string[] {
  const [resolved, setResolved] = useState<string[]>(blocks);

  useEffect(() => {
    if (!hasMermaid(blocks)) {
      setResolved(blocks);
      return;
    }
    let cancelled = false;
    // Show the un-resolved blocks immediately, upgrade when mermaid is ready.
    setResolved(blocks);
    void resolveMermaidBlocks(blocks).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return resolved;
}
