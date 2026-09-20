/**
 * Structured views of a card's Markdown.
 *
 * A table card shows a grid, an equation card shows a formula box — but the
 * card still *is* its Markdown slice. Each parse/serialize pair below has to
 * round-trip: parse(serialize(x)) === x, and a card whose text does not parse
 * falls back to the raw Markdown editor rather than being reshaped to fit the
 * form (P1). The smoke tests pin that down.
 */

const CAPTION_RE = /^:\s+(.*)$/;

/**
 * Pulls a trailing `: caption {#label attr=value ...}` line off a card.
 *
 * `payload` is the raw text inside the braces, label included. It exists
 * because the caller often needs the attributes and `caption` has, by
 * definition, already had the whole brace block stripped out of it. Without it
 * `parseDiagram` was matching `dir=`/`curve=`/`theme=` against a string those
 * attributes had just been removed from, so every diagram loaded from a saved
 * document came back at the defaults and the author's direction, curve and
 * theme were silently discarded on the next save (a P1 violation, and the
 * reason the diagram round-trip check failed).
 */
function takeCaption(text: string): {
  body: string;
  caption: string;
  label: string;
  payload: string;
} {
  const lines = text.replace(/\s+$/, '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as string;
    if (!line.trim()) continue;
    const m = CAPTION_RE.exec(line);
    if (!m) break;
    const { text: caption, label, payload } = takeLabel((m[1] ?? '').trim());
    return {
      body: lines.slice(0, i).join('\n').replace(/\s+$/, ''),
      caption,
      label,
      payload,
    };
  }
  return { body: text.replace(/\s+$/, ''), caption: '', label: '', payload: '' };
}

function takeLabel(text: string): { text: string; label: string; payload: string } {
  const matches = Array.from(text.matchAll(/\{#([a-z]+:[A-Za-z0-9_.-]+)(?:\s+[^{}]*)?\}/g));
  const label = matches.at(-1)?.[1] ?? '';
  const payload = Array.from(text.matchAll(/\{([^{}]*)\}/g))
    .map((m) => m[1] ?? '')
    .join(' ')
    .trim();
  const cleaned = text
    .replace(/\{#.*?\}|\{\s*\}/g, ' ')
    .replace(/\{([^{}]*)\}/g, (_, content: string) =>
      content.replace(/#([a-z]+:[A-Za-z0-9_.-]+)/g, '').trim(),
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text: cleaned, label, payload };
}


function captionLine(caption: string, label: string): string {
  if (!caption && !label) return '';
  return `\n\n: ${caption}${label ? ` {#${label}}` : ''}`.replace(/: \{/, ': {');
}

/* --------------------------------------------------------------- equation */

export interface EquationForm {
  tex: string;
  label: string;
}

export function parseEquation(text: string): EquationForm | null {
  const m = /^\$\$[ \t]*\n?([\s\S]*?)\n?[ \t]*\$\$[ \t]*(\{#[^}]*\})?[ \t]*$/.exec(
    text.trim(),
  );
  if (!m) return null;
  const label = m[2] ? (/\{#([^}]*)\}/.exec(m[2]) as RegExpExecArray)[1] ?? '' : '';
  return { tex: (m[1] ?? '').trim(), label };
}

export function serializeEquation(form: EquationForm): string {
  const tail = form.label ? ` {#${form.label}}` : '';
  return `$$\n${form.tex.trim()}\n$$${tail}`;
}

/* ------------------------------------------------------------- code block */

export interface CodeForm {
  lang: string;
  code: string;
  caption: string;
  label: string;
}

export function parseCode(text: string): CodeForm | null {
  const { body, caption, label } = takeCaption(text);
  const m = /^(```|~~~)([A-Za-z0-9_+-]*)[ \t]*\n([\s\S]*?)\n?\1[ \t]*$/.exec(body.trim());
  if (!m) return null;
  return { lang: (m[2] ?? '').trim(), code: m[3] ?? '', caption, label };
}

export function serializeCode(form: CodeForm): string {
  return `\`\`\`${form.lang}\n${form.code.replace(/\s+$/, '')}\n\`\`\`${captionLine(
    form.caption,
    form.label,
  )}`;
}

/* ---------------------------------------------------------------- diagram */

export interface DiagramForm {
  source: string;
  asset?: string;
  direction: string;
  curve: 'linear' | 'basis' | 'step';
  theme: 'academic' | 'obsidian' | 'blueprint';
  landscape: boolean;
  caption: string;
  label: string;
  attrs: Record<string, string>;
}

/** Values `parseDiagram` falls back to, and therefore values `serializeDiagram` omits. */
const DIAGRAM_DEFAULT_CURVE: DiagramForm['curve'] = 'basis';
const DIAGRAM_DEFAULT_THEME: DiagramForm['theme'] = 'academic';

export function parseDiagram(text: string): DiagramForm | null {
  const trimmed = text.trim();
  const assetMatch = /^!\[([^\]]*)\]\((asset:[^)]+)\)\s*\{([^}]*)\}\s*$/.exec(trimmed);
  if (assetMatch) {
    const asset = assetMatch[2] ?? '';
    const payload = assetMatch[3] ?? '';
    const label = /(?:^|\s)#(dia:[A-Za-z0-9_.-]+)/.exec(payload)?.[1] ?? '';
    if (!label) return null;
    const attrs: Record<string, string> = { asset };
    for (const match of payload.matchAll(/(?:^|\s)([a-z][a-z0-9-]*)=([^\s}]+)/g)) attrs[match[1] as string] = match[2] as string;
    return {
      source: '',
      asset,
      direction: '',
      curve: 'basis',
      theme: 'academic',
      landscape: attrs.orientation === 'landscape' || attrs.landscape === 'true',
      caption: (assetMatch[1] ?? '').trim(),
      label,
      attrs,
    };
  }

  const { body, caption, label, payload } = takeCaption(text);
  const m = /^```mermaid[ \t]*\n([\s\S]*?)\n?```[ \t]*$/.exec(body.trim());
  if (!m) return null;
  // Attributes live inside the braces; `caption` has had the braces removed.
  // Both are searched so a document that writes them outside the braces (the
  // older, undocumented shape) still loads.
  const attrSource = `${payload} ${caption}`;
  const dir = /\bdir=(TB|TD|BT|LR|RL)\b/.exec(attrSource);
  const curve = /\bcurve=(linear|basis|step)\b/.exec(attrSource)?.[1] as DiagramForm['curve'] | undefined;
  const theme = /\btheme=(academic|obsidian|blueprint)\b/.exec(attrSource)?.[1] as DiagramForm['theme'] | undefined;
  const landscape = /\b(?:landscape|orientation=landscape)\b/.test(attrSource);
  const attrs: Record<string, string> = {};
  if (dir) attrs.dir = dir[1] as string;
  if (curve) attrs.curve = curve;
  if (theme) attrs.theme = theme;
  if (landscape) attrs.landscape = 'true';
  const cleanCaption = caption
    .replace(/\s*\bdir=(TB|TD|BT|LR|RL)\b/g, '')
    .replace(/\s*\bcurve=(linear|basis|step)\b/g, '')
    .replace(/\s*\btheme=(academic|obsidian|blueprint)\b/g, '')
    .replace(/\s*\b(?:landscape|orientation=landscape)\b/g, '')
    .replace(/\{\s*\}/g, ' ')
    .trim();
  return {
    source: m[1] ?? '',
    direction: dir ? (dir[1] as string) : '',
    curve: curve ?? DIAGRAM_DEFAULT_CURVE,
    theme: theme ?? DIAGRAM_DEFAULT_THEME,
    landscape,
    caption: cleanCaption,
    label,
    attrs,
  };
}

export function serializeDiagram(form: DiagramForm): string {
  if (form.asset?.startsWith('asset:')) {
    const assetBits = [
      `#${form.label || 'dia:technical-diagram'}`,
      form.attrs['view-x'] ? `view-x=${form.attrs['view-x']}` : '',
      form.attrs['view-y'] ? `view-y=${form.attrs['view-y']}` : '',
      form.attrs['view-zoom'] ? `view-zoom=${form.attrs['view-zoom']}` : '',
      form.landscape ? 'orientation=landscape' : '',
    ].filter(Boolean).join(' ');
    return `![${form.caption || 'Sơ đồ kỹ thuật'}](${form.asset}){${assetBits}}`;
  }
  // Only non-default values are written back. `curve` and `theme` are always
  // populated on the form (the dialog needs a concrete value to render with),
  // so emitting them unconditionally appended `curve=basis theme=academic` to
  // every caption the author had left plain — rewriting the author's source on
  // a round trip that changed nothing, which P1 forbids. DEFAULTs here must
  // stay in step with the fallbacks in `parseDiagram` below.
  const bits = [
    form.label ? `#${form.label}` : '',
    form.direction ? `dir=${form.direction}` : '',
    form.curve && form.curve !== DIAGRAM_DEFAULT_CURVE ? `curve=${form.curve}` : '',
    form.theme && form.theme !== DIAGRAM_DEFAULT_THEME ? `theme=${form.theme}` : '',
    form.landscape ? 'landscape' : '',
  ].filter(Boolean).join(' ');
  const cap = form.caption || bits ? `\n\n: ${form.caption}${bits ? ` {${bits}}` : ''}` : '';
  return `\`\`\`mermaid\n${form.source.replace(/\s+$/, '')}\n\`\`\`${cap}`;
}

/* ----------------------------------------------------------------- figure */

export interface FigureForm {
  alt: string;
  src: string;
  label: string;
  width: string;
}

export function parseFigure(text: string): FigureForm | null {
  const m = /^!\[([^\]]*)\]\(([^)]*)\)(\{([^}]*)\})?[ \t]*$/.exec(text.trim());
  if (!m) return null;
  const attrs = m[4] ?? '';
  const label = /#([a-z]+:[A-Za-z0-9_.-]+)/.exec(attrs)?.[1] ?? '';
  const width = /\bwidth=([^\s}]+)/.exec(attrs)?.[1] ?? '';
  return { alt: m[1] ?? '', src: m[2] ?? '', label, width };
}

export function serializeFigure(form: FigureForm): string {
  const bits = [form.label ? `#${form.label}` : '', form.width ? `width=${form.width}` : '']
    .filter(Boolean)
    .join(' ');
  return `![${form.alt}](${form.src})${bits ? `{${bits}}` : ''}`;
}

/* ------------------------------------------------------------------ table */

export type CellAlign = 'default' | 'left' | 'right' | 'center' | 'decimal';

export interface TableForm {
  header: string[];
  align: CellAlign[];
  rows: string[][];
  caption: string;
  label: string;
  /** Trailing table caption attributes, kept verbatim for P1. */
  attrs: Record<string, string>;
  /** Exact `{...}` payload from the source caption, used for lossless round-trip when untouched. */
  attrsRaw?: string;
  sourceLabel?: string;
  sourceDecimalCols?: string;
  sourceAlign?: CellAlign[];
  sourceAlignSpec?: string[];
}

const DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let buf = '';
  let inMath = false;
  let mathFence = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i] as string;
    if (ch === '\\' && t[i + 1] === '|') { buf += '|'; i++; continue; }
    if (ch === '$') {
      if (t[i + 1] === '$') { inMath = !inMath; mathFence = inMath ? '$$' : ''; buf += '$$'; i++; continue; }
      if (mathFence !== '$$') { inMath = !inMath; mathFence = inMath ? '$' : ''; }
      buf += ch;
      continue;
    }
    if (ch === '|' && !inMath) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf.trim());
  return out;
}


function alignOf(spec: string): CellAlign {
  const t = spec.trim();
  if (t.startsWith(':') && t.endsWith(':')) return 'center';
  if (t.endsWith(':')) return 'right';
  if (t.startsWith(':')) return 'left';
  return 'default';
}

function alignSpec(a: CellAlign): string {
  switch (a) {
    case 'left': return ':---';
    case 'right':
    case 'decimal': return '---:';
    case 'center': return ':---:';
    default: return '---';
  }
}

function parseCaptionAttrs(line: string): { caption: string; label: string; attrs: Record<string, string>; attrsRaw: string } {
  const m = /^:\s+(.*)$/.exec(line.trim());
  if (!m) return { caption: '', label: '', attrs: {}, attrsRaw: '' };
  const body = m[1] ?? '';
  const am = /\{([^{}]*)\}\s*$/.exec(body);
  if (!am) return { caption: body.trim(), label: '', attrs: {}, attrsRaw: '' };
  const rawAttrs = am[1] ?? '';
  const label = /(?:^|\s)#([a-z]+:[A-Za-z0-9_.-]+)/.exec(rawAttrs)?.[1] ?? '';
  const attrs: Record<string, string> = {};
  for (const token of rawAttrs.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []) {
    if (token.startsWith('#') || token === '-') continue;
    const eq = token.indexOf('=');
    if (eq > 0) attrs[token.slice(0, eq)] = token.slice(eq + 1).replace(/^['"]|['"]$/g, '');
  }
  return { caption: body.slice(0, am.index).trim(), label, attrs, attrsRaw: rawAttrs };
}

function takeTableCaption(text: string): { body: string; caption: string; label: string; attrs: Record<string, string>; attrsRaw: string } {
  const lines = text.replace(/\s+$/, '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as string;
    if (!line.trim()) continue;
    if (!/^:\s+/.test(line)) break;
    const cap = parseCaptionAttrs(line);
    return { body: lines.slice(0, i).join('\n').replace(/\s+$/, ''), ...cap };
  }
  return { body: text.replace(/\s+$/, ''), caption: '', label: '', attrs: {}, attrsRaw: '' };
}

export function parseTable(text: string): TableForm | null {
  const { body, caption, label, attrs, attrsRaw } = takeTableCaption(text);
  const lines = body.split('\n').filter((l) => l.trim());
  if (lines.length < 2 || !DELIM.test(lines[1] as string)) return null;
  const header = splitRow(lines[0] as string);
  const align = splitRow(lines[1] as string).map(alignOf);
  const decimalCols = new Set(
    (attrs['decimal-cols'] ?? '')
      .split(',')
      .map((v) => Number(v.trim()) - 1)
      .filter((v) => Number.isInteger(v) && v >= 0),
  );
  decimalCols.forEach((c) => {
    if (c < align.length) align[c] = 'decimal';
  });
  const rows = lines.slice(2).map(splitRow);
  return {
    header,
    align,
    rows,
    caption,
    label,
    attrs,
    attrsRaw,
    sourceLabel: label,
    sourceDecimalCols: attrs['decimal-cols'] ?? '',
    sourceAlign: align.slice(),
    sourceAlignSpec: splitRow(lines[1] as string),
  };
}

function escapeCell(v: string): string {
  return v.replace(/\|/g, '\\|');
}

function serialisedTableAttrs(form: TableForm): string[] {
  const attrs = { ...form.attrs };
  const decimalCols = form.align
    .map((a, i) => (a === 'decimal' ? i + 1 : null))
    .filter((v): v is number => v != null);
  if (decimalCols.length) attrs['decimal-cols'] = decimalCols.join(',');
  else delete attrs['decimal-cols'];
  if (form.label) attrs['#label'] = form.label;
  else delete attrs['#label'];
  return Object.entries(attrs)
    .filter(([key]) => key !== '#label')
    .map(([key, value]) => `${key}=${value}`);
}

export function serializeTable(form: TableForm): string {
  const width = form.header.length;
  const pad = (r: string[]): string[] =>
    Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? ''));
  const separator = Array.from({ length: width }, (_, i) => {
    const current = form.align[i] ?? 'default';
    const unchanged = form.sourceAlign?.[i] === current && form.sourceAlignSpec?.[i] != null;
    return unchanged ? form.sourceAlignSpec![i]! : alignSpec(current);
  });
  const lines = [
    `| ${pad(form.header).join(' | ')} |`,
    `|${separator.join('|')}|`,
    ...form.rows.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  const decimalCols = form.align
    .map((a, i) => (a === 'decimal' ? i + 1 : null))
    .filter((v): v is number => v != null)
    .join(',');
  const canPreserveAttrs = Boolean(form.attrsRaw) && form.label === (form.sourceLabel ?? '') && decimalCols === (form.sourceDecimalCols ?? '');
  const attrs = serialisedTableAttrs(form);
  const tailBits = canPreserveAttrs ? form.attrsRaw! : [form.label ? `#${form.label}` : '', ...attrs].filter(Boolean).join(' ');
  if (!form.caption && !tailBits) return lines.join('\n');
  return `${lines.join('\n')}\n\n: ${form.caption}${tailBits ? ` {${tailBits}}` : ''}`.replace(/: \{/, ': {');
}

/* ----------------------------------------------------------------- heading */

export function headingDepth(text: string): number {
  return /^(#{1,6})[ \t]/.exec(text)?.[1]?.length ?? 0;
}

export function setHeadingDepth(text: string, depth: number): string {
  const safeDepth = Math.max(1, Math.min(6, Math.round(depth)));
  const body = text.replace(/^#{1,6}[ \t]?/, '');
  return `${'#'.repeat(safeDepth)} ${body}`;
}
