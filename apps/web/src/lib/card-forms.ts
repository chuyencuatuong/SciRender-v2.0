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

/** Pulls a trailing `: caption {#label}` line off a card. */
function takeCaption(text: string): { body: string; caption: string; label: string } {
  const lines = text.replace(/\s+$/, '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as string;
    if (!line.trim()) continue;
    const m = CAPTION_RE.exec(line);
    if (!m) break;
    const { text: caption, label } = takeLabel((m[1] ?? '').trim());
    return { body: lines.slice(0, i).join('\n').replace(/\s+$/, ''), caption, label };
  }
  return { body: text.replace(/\s+$/, ''), caption: '', label: '' };
}

function takeLabel(text: string): { text: string; label: string } {
  const m = /\{#([a-z]+:[A-Za-z0-9_.-]+)\}\s*$/.exec(text.trim());
  if (!m) return { text: text.trim(), label: '' };
  return { text: text.slice(0, m.index).trim(), label: m[1] as string };
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
  direction: string;
  caption: string;
  label: string;
}

export function parseDiagram(text: string): DiagramForm | null {
  const { body, caption, label } = takeCaption(text);
  const m = /^```mermaid[ \t]*\n([\s\S]*?)\n?```[ \t]*$/.exec(body.trim());
  if (!m) return null;
  const dir = /\bdir=(TB|TD|BT|LR|RL)\b/.exec(caption);
  return {
    source: m[1] ?? '',
    direction: dir ? (dir[1] as string) : '',
    caption: caption.replace(/\s*\bdir=(TB|TD|BT|LR|RL)\b/, '').trim(),
    label,
  };
}

export function serializeDiagram(form: DiagramForm): string {
  const label = form.label
    ? ` {#${form.label}${form.direction ? ` dir=${form.direction}` : ''}}`
    : form.direction
      ? ` {dir=${form.direction}}`
      : '';
  const cap = form.caption || label ? `\n\n: ${form.caption}${label}` : '';
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

export type CellAlign = 'default' | 'left' | 'right' | 'center';

export interface TableForm {
  header: string[];
  align: CellAlign[];
  rows: string[][];
  caption: string;
  label: string;
}

const DELIM = /^\s*\|?(\s*:?-{1,}:?\s*\|)+\s*:?-{1,}:?\s*\|?\s*$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i] as string;
    if (ch === '\\' && t[i + 1] === '|') { buf += '|'; i++; continue; }
    if (ch === '|') { out.push(buf.trim()); buf = ''; continue; }
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
    case 'right': return '---:';
    case 'center': return ':---:';
    default: return '---';
  }
}

export function parseTable(text: string): TableForm | null {
  const { body, caption, label } = takeCaption(text);
  const lines = body.split('\n').filter((l) => l.trim());
  if (lines.length < 2 || !DELIM.test(lines[1] as string)) return null;
  const header = splitRow(lines[0] as string);
  const align = splitRow(lines[1] as string).map(alignOf);
  const rows = lines.slice(2).map(splitRow);
  return { header, align, rows, caption, label };
}

function escapeCell(v: string): string {
  return v.replace(/\|/g, '\\|');
}

export function serializeTable(form: TableForm): string {
  const width = form.header.length;
  const pad = (r: string[]): string[] =>
    Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? ''));
  const lines = [
    `| ${pad(form.header).join(' | ')} |`,
    `|${Array.from({ length: width }, (_, i) => alignSpec(form.align[i] ?? 'default')).join('|')}|`,
    ...form.rows.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  return lines.join('\n') + captionLine(form.caption, form.label);
}

/* ----------------------------------------------------------------- heading */

export function headingDepth(text: string): number {
  return /^(#{1,6})\s/.exec(text.trim())?.[1]?.length ?? 0;
}

export function setHeadingDepth(text: string, depth: number): string {
  return text.trim().replace(/^#{1,6}\s+/, `${'#'.repeat(depth)} `);
}
