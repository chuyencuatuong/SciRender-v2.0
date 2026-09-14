export interface AttrSpec {
  label: string | null;
  classes: string[];
  attrs: Record<string, string>;
  unnumbered: boolean;
}

export function emptyAttrs(): AttrSpec {
  return { label: null, classes: [], attrs: {}, unnumbered: false };
}

/**
 * Parses a trailing attribute block: `{#fig:setup width=80% .wide -}`.
 * Returns the attributes plus the text with the block removed.
 * Unrecognised entries are preserved in `attrs` rather than dropped (P1).
 */
export function extractTrailingAttrs(text: string): { text: string; spec: AttrSpec } {
  const m = /\{([^{}]*)\}\s*$/.exec(text);
  if (!m) return { text, spec: emptyAttrs() };
  const spec = parseAttrBody(m[1] as string);
  if (!spec) return { text, spec: emptyAttrs() };
  return { text: text.slice(0, m.index).replace(/\s+$/, ''), spec };
}

export function parseAttrBody(body: string): AttrSpec | null {
  const spec = emptyAttrs();
  const tokens = body.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!tokens || !tokens.length) return null;
  let recognised = false;
  for (const token of tokens) {
    if (token === '-' || token === '.unnumbered') {
      spec.unnumbered = true;
      recognised = true;
    } else if (token.startsWith('#')) {
      spec.label = token.slice(1);
      recognised = true;
    } else if (token.startsWith('.')) {
      spec.classes.push(token.slice(1));
      recognised = true;
    } else {
      const eq = token.indexOf('=');
      if (eq > 0) {
        const k = token.slice(0, eq);
        const v = token.slice(eq + 1).replace(/^["']|["']$/g, '');
        spec.attrs[k] = v;
        recognised = true;
      }
    }
  }
  return recognised ? spec : null;
}
