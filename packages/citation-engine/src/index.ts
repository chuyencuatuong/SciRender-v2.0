import type { BibEntry } from '@scirender/ast';

export interface BibTeXParseResult {
  entries: BibEntry[];
  errors: string[];
  warnings: string[];
}

const SUPPORTED_TYPES = new Set(['article', 'book', 'inproceedings', 'incollection', 'misc', 'techreport', 'phdthesis', 'mastersthesis', 'unpublished']);

/**
 * Small, dependency-free BibTeX parser. It deliberately handles only the
 * structural subset SciRender needs for reports: balanced braces, quoted
 * values, escaped quotes, `and` author lists and the common entry types.
 * Unknown entry types are still imported as long as their key and fields can
 * be parsed — P1 means we should preserve useful data rather than drop it.
 */
export function parseBibTeX(source: string): BibTeXParseResult {
  const entries: BibEntry[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let i = 0;

  while (i < source.length) {
    const at = source.indexOf('@', i);
    if (at === -1) break;
    i = at + 1;

    const typeStart = i;
    while (i < source.length && /[A-Za-z]/.test(source[i] as string)) i++;
    const rawType = source.slice(typeStart, i).toLowerCase();
    while (i < source.length && /\s/.test(source[i] as string)) i++;
    if (source[i] !== '{' && source[i] !== '(') {
      errors.push(`Entry @${rawType || '?'} thiếu dấu mở "{".`);
      continue;
    }
    const open = source[i] as string;
    const close = open === '{' ? '}' : ')';
    const entryStart = i;
    const end = findBalanced(source, i, open, close);
    if (end === -1) {
      errors.push(`Entry @${rawType || '?'} không có dấu đóng tương ứng.`);
      break;
    }
    const body = source.slice(i + 1, end);
    i = end + 1;

    const comma = findTopLevelComma(body);
    if (comma === -1) {
      if (!['comment', 'preamble', 'string'].includes(rawType)) {
        warnings.push(`Bỏ qua entry @${rawType || '?'} tại vị trí ${entryStart + 1}: thiếu dấu phẩy sau citation key.`);
      }
      continue;
    }

    const key = body.slice(0, comma).trim();
    if (!key || !/^[A-Za-z0-9_.:-]+$/.test(key)) {
      errors.push(`Citation key không hợp lệ: "${key}".`);
      continue;
    }
    if (['comment', 'preamble', 'string'].includes(rawType)) continue;

    const fields = parseFields(body.slice(comma + 1), errors, key);
    const type = rawType || 'misc';
    if (!SUPPORTED_TYPES.has(type)) {
      warnings.push(`Entry "${key}" có type "${type}"; vẫn nhập vì SciRender hỗ trợ fallback như misc.`);
    }

    const entry: BibEntry = { key, type };
    const author = fields.author;
    if (author) entry.authors = normalizeAuthors(author);
    for (const name of ['title', 'year', 'journal', 'booktitle', 'publisher', 'volume', 'pages', 'doi', 'url']) {
      const value = fields[name];
      if (!value) continue;
      if (name === 'journal' || name === 'booktitle' || name === 'publisher') {
        if (!entry.source) entry.source = value;
        continue;
      }
      (entry as unknown as Record<string, unknown>)[name] = value;
    }
    const chapter = fields.chapter;
    if (chapter && !entry.source) entry.source = `Ch. ${chapter}`;
    entries.push(entry);
  }

  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    if (seen.has(entry.key)) {
      warnings.push(`Citation key "${entry.key}" xuất hiện nhiều hơn một lần; giữ entry đầu tiên.`);
      return false;
    }
    seen.add(entry.key);
    return true;
  });

  return { entries: unique, errors, warnings };
}

function findBalanced(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  let inQuote = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    if (inQuote) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findTopLevelComma(text: string): number {
  let depth = 0;
  let inQuote = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inQuote = !inQuote;
    if (inQuote) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && depth > 0) depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}

function parseFields(text: string, errors: string[], key: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;

  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i] as string)) i++;
    if (i >= text.length) break;

    const start = i;
    while (i < text.length && /[A-Za-z0-9_:-]/.test(text[i] as string)) i++;
    const name = text.slice(start, i).toLowerCase();
    while (i < text.length && /\s/.test(text[i] as string)) i++;
    if (text[i] !== '=') {
      while (i < text.length && text[i] !== ',') i++;
      continue;
    }
    i++;
    while (i < text.length && /\s/.test(text[i] as string)) i++;

    const valueStart = i;
    const value = readValue(text, () => i++, i);
    i = value.next;
    if (!name) {
      errors.push(`Entry "${key}" có field không tên.`);
      continue;
    }
    if (value.value) out[name] = cleanValue(value.value);
    if (i < text.length && text[i] === ',') i++;
    if (i === valueStart) i++;
  }
  return out;
}

function readValue(text: string, _advance: () => void, start: number): { value: string; next: number } {
  let i = start;
  const first = text[i] as string | undefined;
  if (first === '"') {
    i++;
    const out: string[] = [];
    let escaped = false;
    while (i < text.length) {
      const ch = text[i] as string;
      if (escaped) {
        out.push(ch === '"' ? '"' : `\\${ch}`);
        escaped = false;
        i++;
        continue;
      }
      if (ch === '\\') {
        out.push(ch);
        escaped = true;
        i++;
        continue;
      }
      if (ch === '"') return { value: out.join(''), next: i + 1 };
      out.push(ch);
      i++;
    }
    return { value: out.join(''), next: i };
  }
  if (first === '{') {
    const end = findBalanced(text, i, '{', '}');
    if (end === -1) return { value: text.slice(i + 1), next: text.length };
    return { value: text.slice(i + 1, end), next: end + 1 };
  }

  const startBare = i;
  while (i < text.length && text[i] !== ',') i++;
  return { value: text.slice(startBare, i).trim(), next: i };
}

function cleanValue(value: string): string {
  return value
    .replace(/\\([{}])/g, '$1')
    .replace(/\\"/g, '"')
    .replace(/\\&/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** BibTeX's author separator is `and`. We store a stable semicolon-separated list. */
export function normalizeAuthors(authorField: string): string {
  return authorField
    .split(/\s+and\s+/i)
    .map((name) => normalizeAuthorName(name))
    .filter(Boolean)
    .join('; ');
}

function normalizeAuthorName(name: string): string {
  const text = name.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const braces = text.replace(/^\{+|\}+$/g, '').trim();
  return braces;
}

export function parseAuthors(value?: string): string[] {
  if (!value) return [];
  if (value.includes(';')) return value.split(';').map((x) => x.trim()).filter(Boolean);
  return value.split(/\s*,\s*(?=[A-ZÀ-ÖØ-Ý][^,]*$)/).map((x) => x.trim()).filter(Boolean);
}

export function formatCitationCluster(
  entries: BibEntry[],
  keys: string[],
  style: 'ieee' | 'apa',
  numbers: Map<string, number>,
): string {
  if (style === 'apa') {
    return `(${keys.map((key) => formatAuthorYear(entries.find((e) => e.key === key))).join('; ')})`;
  }
  return `[${keys.map((key) => String(numbers.get(key) ?? '?')).join(', ')}]`;
}

export function formatAuthorYear(entry?: BibEntry): string {
  if (!entry) return 'Unknown';
  const authors = parseAuthors(entry.authors);
  const year = entry.year === undefined || entry.year === '' ? 'n.d.' : String(entry.year);
  if (!authors.length) return `${entry.title ?? entry.key}, ${year}`;
  if (authors.length === 1) return `${familyName(authors[0]!)}, ${year}`;
  if (authors.length === 2) return `${familyName(authors[0]!)} & ${familyName(authors[1]!)}, ${year}`;
  return `${familyName(authors[0]!)} et al., ${year}`;
}

function familyName(author: string): string {
  const comma = author.indexOf(',');
  if (comma > 0) return author.slice(0, comma).trim();
  const words = author.split(/\s+/).filter(Boolean);
  return words[words.length - 1] ?? author;
}

export function formatIEEEReference(entry: BibEntry, index: number): string {
  const pieces: string[] = [];
  if (entry.authors) pieces.push(entry.authors);
  if (entry.title) pieces.push(`"${entry.title}"`);
  if (entry.source) pieces.push(entry.source);
  if (entry.volume) pieces.push(`vol. ${entry.volume}`);
  if (entry.pages) pieces.push(`pp. ${entry.pages}`);
  if (entry.year) pieces.push(String(entry.year));
  if (entry.doi) pieces.push(`doi: ${entry.doi}`);
  return `[${index}] ${pieces.join(', ')}.`;
}

export function formatAPAReference(entry: BibEntry): string {
  const pieces: string[] = [];
  if (entry.authors) pieces.push(entry.authors);
  if (entry.year) pieces.push(`(${entry.year})`);
  if (entry.title) pieces.push(entry.title);
  if (entry.source) pieces.push(entry.source);
  if (entry.volume) pieces.push(entry.volume);
  if (entry.pages) pieces.push(entry.pages);
  if (entry.doi) pieces.push(`https://doi.org/${entry.doi.replace(/^https?:\/\/doi.org\//i, '')}`);
  return pieces.join('. ') + (pieces.length ? '.' : '');
}

export function serializeBibliographyYaml(entries: BibEntry[], key = 'bibliography'): string {
  const lines = [`${key}:`];
  for (const entry of entries) {
    lines.push(`  - key: ${yamlQuote(entry.key)}`);
    if (entry.type) lines.push(`    type: ${yamlQuote(entry.type)}`);
    if (entry.authors) lines.push(`    authors: ${yamlQuote(entry.authors)}`);
    if (entry.title) lines.push(`    title: ${yamlQuote(entry.title)}`);
    if (entry.year !== undefined && entry.year !== '') lines.push(`    year: ${yamlQuote(String(entry.year))}`);
    if (entry.source) lines.push(`    source: ${yamlQuote(entry.source)}`);
    if (entry.volume) lines.push(`    volume: ${yamlQuote(entry.volume)}`);
    if (entry.pages) lines.push(`    pages: ${yamlQuote(entry.pages)}`);
    if (entry.doi) lines.push(`    doi: ${yamlQuote(entry.doi)}`);
    if (entry.url) lines.push(`    url: ${yamlQuote(entry.url)}`);
  }
  return lines.join('\n');
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** Replaces only the bibliography section of existing front matter (P1). */
export function mergeBibliographyFrontMatter(source: string, incoming: BibEntry[]): string {
  if (!incoming.length) return source;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const hasFront = lines[0] === '---';

  const existingBody = hasFront ? lines.slice(1, findFrontMatterEnd(lines)) : [];
  const existingEntries = hasFront ? extractYamlLikeBibliography(existingBody) : [];
  const merged = mergeEntries(existingEntries, incoming);
  const block = serializeBibliographyYaml(merged, 'bibliography').split('\n');

  if (!hasFront) {
    return ['---', ...block, '---', '', ...lines].join('\n');
  }

  const end = findFrontMatterEnd(lines);
  if (end === -1) return source;
  const body = lines.slice(1, end);
  const keyIndex = body.findIndex((line) => /^bibliography\s*:\s*(?:#.*)?$/.test(line) || /^references\s*:\s*(?:#.*)?$/.test(line));
  if (keyIndex === -1) {
    lines.splice(end, 0, ...block);
    return lines.join('\n');
  }

  let next = keyIndex + 1;
  while (next < body.length && (/^\s/.test(body[next] as string) || !(body[next] ?? '').trim())) next++;
  const replacementKey = /^references\s*:/.test(body[keyIndex] as string) ? 'references' : 'bibliography';
  const replacement = serializeBibliographyYaml(merged, replacementKey).split('\n');
  body.splice(keyIndex, next - keyIndex, ...replacement);
  return ['---', ...body, ...lines.slice(end)].join('\n');
}

function findFrontMatterEnd(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') return i;
  return -1;
}

function extractYamlLikeBibliography(lines: string[]): BibEntry[] {
  const start = lines.findIndex((line) => /^bibliography\s*:/.test(line) || /^references\s*:/.test(line));
  if (start === -1) return [];
  const out: BibEntry[] = [];
  let current: Partial<BibEntry> | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^[A-Za-z_][\w-]*\s*:/.test(line)) break;
    const item = /^\s+-\s+key:\s+(.+)$/.exec(line);
    if (item) {
      if (current?.key) out.push(current as BibEntry);
      current = { key: unquoteYaml(item[1]!) };
      continue;
    }
    if (!current) continue;
    const field = /^\s{4,}([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!field) continue;
    const name = field[1]!.toLowerCase();
    const value = unquoteYaml(field[2]!);
    if (name === 'type') current.type = value;
    else if (name === 'authors' || name === 'author') current.authors = value;
    else if (name === 'title') current.title = value;
    else if (name === 'year') current.year = value;
    else if (name === 'source' || name === 'journal' || name === 'booktitle' || name === 'publisher') current.source = current.source ?? value;
    else if (name === 'volume') current.volume = value;
    else if (name === 'pages') current.pages = value;
    else if (name === 'doi') current.doi = value;
    else if (name === 'url') current.url = value;
  }
  if (current?.key) out.push(current as BibEntry);
  return out;
}

function unquoteYaml(value: string): string {
  const t = value.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) as string; } catch { return t.slice(1, -1); }
  }
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function mergeEntries(existing: BibEntry[], incoming: BibEntry[]): BibEntry[] {
  const out = existing.map((entry) => ({ ...entry }));
  const index = new Map(out.map((entry, i) => [entry.key, i]));
  for (const entry of incoming) {
    const at = index.get(entry.key);
    if (at === undefined) {
      index.set(entry.key, out.length);
      out.push({ ...entry });
    } else {
      out[at] = { ...out[at], ...entry };
    }
  }
  return out;
}
