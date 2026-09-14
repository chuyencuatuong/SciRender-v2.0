import type { Author, BibEntry, Diagnostic, DocumentMeta } from '@scirender/ast';
import yaml from 'js-yaml';

const KNOWN_KEYS = new Set([
  'title', 'subtitle', 'authors', 'author', 'abstract', 'keywords',
  'date', 'language', 'lang', 'template', 'bibliography', 'references',
]);

export interface FrontMatterResult {
  meta: DocumentMeta;
  /** Offset in the source where the document body begins. */
  bodyOffset: number;
  /** Line number (1-based) where the body begins. */
  bodyLine: number;
  diagnostics: Diagnostic[];
}

const FENCE = /^---[ \t]*$/;

export function parseFrontMatter(src: string): FrontMatterResult {
  const meta: DocumentMeta = {
    title: '',
    authors: [],
    keywords: [],
    language: 'vi',
    bibliography: [],
    extra: {},
  };
  const diagnostics: Diagnostic[] = [];
  const lines = src.split('\n');

  if (!lines.length || !FENCE.test(lines[0] ?? '')) {
    return { meta, bodyOffset: 0, bodyLine: 1, diagnostics };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i] ?? '')) { end = i; break; }
  }
  if (end === -1) {
    diagnostics.push({
      code: 'SR-P001',
      severity: 'error',
      stage: 'parser',
      message: 'Front matter mở bằng "---" nhưng không có "---" đóng.',
      hint: 'Thêm một dòng "---" để kết thúc khối front matter.',
      position: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 4, offset: 3 },
      },
    });
    return { meta, bodyOffset: 0, bodyLine: 1, diagnostics };
  }

  const raw = lines.slice(1, end).join('\n');
  let data: unknown;
  try {
    data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    diagnostics.push({
      code: 'SR-P002',
      severity: 'error',
      stage: 'parser',
      message: `Front matter YAML không hợp lệ: ${(err as Error).message.split('\n')[0]}`,
      position: {
        start: { line: 2, column: 1, offset: 0 },
        end: { line: end + 1, column: 1, offset: 0 },
      },
    });
    data = {};
  }

  const bodyOffset = lines.slice(0, end + 1).reduce((a, l) => a + l.length + 1, 0);
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;

  meta.title = str(obj.title) ?? '';
  const subtitle = str(obj.subtitle);
  if (subtitle) meta.subtitle = subtitle;
  meta.authors = normaliseAuthors(obj.authors ?? obj.author);
  const abstract = str(obj.abstract);
  if (abstract) meta.abstract = abstract.trim();
  meta.keywords = normaliseKeywords(obj.keywords);
  const date = str(obj.date);
  if (date) meta.date = date;
  meta.language = str(obj.language) ?? str(obj.lang) ?? 'vi';
  const template = str(obj.template);
  if (template) meta.templateId = template;
  meta.bibliography = normaliseBibliography(obj.bibliography ?? obj.references, diagnostics);

  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN_KEYS.has(k)) meta.extra[k] = v; // P1: keep what we do not understand.
  }

  return { meta, bodyOffset, bodyLine: end + 2, diagnostics };
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function normaliseAuthors(v: unknown): Author[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  const out: Author[] = [];
  for (const item of list) {
    if (typeof item === 'string') { out.push({ name: item }); continue; }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = str(o.name) ?? str(o.fullname) ?? '';
      if (!name) continue;
      const a: Author = { name };
      const aff = str(o.affiliation) ?? str(o.org);
      if (aff) a.affiliation = aff;
      const email = str(o.email);
      if (email) a.email = email;
      const orcid = str(o.orcid);
      if (orcid) a.orcid = orcid;
      if (o.corresponding === true) a.corresponding = true;
      out.push(a);
    }
  }
  return out;
}

function normaliseKeywords(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x) ?? '').filter(Boolean);
  const s = str(v);
  if (!s) return [];
  return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
}

function normaliseBibliography(v: unknown, diagnostics: Diagnostic[]): BibEntry[] {
  if (!Array.isArray(v)) return [];
  const out: BibEntry[] = [];
  const seen = new Set<string>();
  v.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const key = str(o.key) ?? str(o.id);
    if (!key) {
      diagnostics.push({
        code: 'SR-P003',
        severity: 'warning',
        stage: 'parser',
        message: `Mục tài liệu tham khảo thứ ${idx + 1} thiếu trường "key" nên không thể trích dẫn.`,
        position: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
      });
      return;
    }
    if (seen.has(key)) {
      diagnostics.push({
        code: 'SR-P004',
        severity: 'error',
        stage: 'parser',
        message: `Khóa trích dẫn "${key}" bị trùng trong danh mục tài liệu tham khảo.`,
        position: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
      });
      return;
    }
    seen.add(key);
    const e: BibEntry = { key };
    const authors = str(o.authors) ?? str(o.author);
    if (authors) e.authors = authors;
    const title = str(o.title);
    if (title) e.title = title;
    const year = str(o.year);
    if (year) e.year = year;
    const source = str(o.source) ?? str(o.journal) ?? str(o.publisher);
    if (source) e.source = source;
    const volume = str(o.volume);
    if (volume) e.volume = volume;
    const pages = str(o.pages);
    if (pages) e.pages = pages;
    const doi = str(o.doi);
    if (doi) e.doi = doi;
    const url = str(o.url);
    if (url) e.url = url;
    out.push(e);
  });
  return out;
}
