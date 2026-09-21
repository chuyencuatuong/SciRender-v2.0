import { splitFrontMatter } from './cards';

/**
 * Fills the HCMUT BTL cover (`cover:` in the front matter) from the signed-in
 * student's profile.
 *
 * P1 — the source stays the only truth and nothing the author wrote is lost:
 *   • a *pristine* document (byte-identical to the built-in sample/empty
 *     template, i.e. the user has not typed a character yet) gets its
 *     cover identity replaced outright;
 *   • any other document only has **placeholders** filled — an empty field,
 *     `Khoa ...`, or a member list made only of `Họ và tên thành viên` /
 *     blank names. A real member list is left alone, except that the
 *     student's own row gets an MSSV if it was blank.
 *
 * Edits are line-level inside the `cover:` block: every other key, comment
 * and ordering in the front matter is preserved byte for byte. Values are
 * written as JSON strings, which are valid YAML double-quoted scalars, so a
 * name containing `:`/`#`/quotes/newlines cannot break or inject YAML.
 *
 * Mapping (profile → front matter):
 *   full_name + student_id → cover.members[] (name, mssv)   — "Sinh viên thực hiện"
 *   faculty                → cover.faculty                   — printed in the header
 *   major                  → cover.major                     — stored only: the HCMUT
 *                            cover layout has no slot for "Ngành", so the parser
 *                            ignores it today (see docs/DAY1-INTEGRATION.md).
 */
export interface CoverProfile {
  full_name: string;
  student_id: string;
  faculty: string;
  major: string;
}

export type CoverField = 'members' | 'mssv' | 'faculty' | 'major';

export interface CoverFillResult {
  source: string;
  changed: CoverField[];
}

const PLACEHOLDER_MEMBER = /^(?:họ và tên thành viên|họ và tên|ho va ten)?$/i;
const PLACEHOLDER_FACULTY = /^(?:khoa\s*(?:\.{2,}|…)?)?$/i;
// "Khoa học Ứng dụng" is a faculty *name* that happens to start with "Khoa"
// (science), so "Khoa học…" alone does not count as already prefixed — the
// real unit reads "Khoa Khoa học Ứng dụng".
const UNIT_PREFIX =
  /^(?:khoa\s+(?!học(?:\s|$))|viện\s|vien\s|trung tâm\s|bộ môn\s|trường\s|faculty\s|school\s|department\s|institute\s)/iu;

const q = (value: string): string => JSON.stringify(value);

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    try {
      return v.startsWith('"') ? String(JSON.parse(v)) : v.slice(1, -1).replace(/''/g, "'");
    } catch {
      return v.slice(1, -1);
    }
  }
  return v.replace(/\s+#.*$/, '');
}

const norm = (s: string): string => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** The HCMUT header prints the unit verbatim; "Kỹ thuật Y sinh" alone would read as a fragment. */
export function facultyLabel(faculty: string): string {
  const f = faculty.trim();
  return !f || UNIT_PREFIX.test(f) ? f : `Khoa ${f}`;
}

interface KeyRange {
  key: string;
  start: number; // line index of `  key:`
  end: number; // exclusive
  value: string; // inline value after the colon
}

function coverKeys(lines: string[], from: number, to: number): KeyRange[] {
  const out: KeyRange[] = [];
  for (let i = from; i < to; i++) {
    const m = /^ {2}([A-Za-z_][\w-]*):(.*)$/.exec(lines[i] ?? '');
    if (!m) continue;
    if (out.length) out[out.length - 1]!.end = i;
    out.push({ key: m[1]!, start: i, end: to, value: m[2] ?? '' });
  }
  return out;
}

interface Member {
  name: string;
  mssv: string;
  /** Line index of the `mssv:` line, or -1. */
  mssvLine: number;
  /** Line index of the `- ` line. */
  line: number;
}

function parseMembers(lines: string[], range: KeyRange): Member[] {
  const out: Member[] = [];
  for (let i = range.start + 1; i < range.end; i++) {
    const line = lines[i] ?? '';
    const item = /^\s{2,}-\s*(.*)$/.exec(line);
    if (item) {
      const rest = item[1] ?? '';
      const named = /^(?:name|hoten):(.*)$/.exec(rest);
      const mssvFirst = /^(?:mssv|studentId|id):(.*)$/.exec(rest);
      out.push({
        name: named ? unquote(named[1] ?? '') : mssvFirst ? '' : unquote(rest),
        mssv: mssvFirst ? unquote(mssvFirst[1] ?? '') : '',
        mssvLine: mssvFirst ? i : -1,
        line: i,
      });
      continue;
    }
    const current = out[out.length - 1];
    if (!current) continue;
    const kv = /^\s{4,}(name|hoten|mssv|studentId|id):(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[1] === 'name' || kv[1] === 'hoten') current.name = unquote(kv[2] ?? '');
    else {
      current.mssv = unquote(kv[2] ?? '');
      current.mssvLine = i;
    }
  }
  return out;
}

function memberLines(profile: CoverProfile): string[] {
  return ['  members:', `    - name: ${q(profile.full_name.trim())}`, `      mssv: ${q(profile.student_id.trim())}`];
}

export function applyProfileToCover(
  source: string,
  profile: CoverProfile,
  options: { pristine?: boolean } = {},
): CoverFillResult {
  const unchanged: CoverFillResult = { source, changed: [] };
  const name = profile.full_name.trim();
  const mssv = profile.student_id.trim();
  const faculty = facultyLabel(profile.faculty);
  const major = profile.major.trim();
  if (!name && !mssv && !faculty && !major) return unchanged;

  const src = source.replace(/\r\n?/g, '\n');
  const { frontMatter } = splitFrontMatter(src);
  if (!frontMatter) return unchanged;

  const lines = frontMatter.split('\n');
  const coverAt = lines.findIndex((l) => /^cover:\s*$/.test(l));
  if (coverAt < 0) return unchanged; // no block (or flow style) — never invent structure here

  let blockEnd = lines.length;
  for (let i = coverAt + 1; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.trim() !== '' && !/^\s/.test(l)) {
      blockEnd = i;
      break;
    }
  }

  const pristine = options.pristine === true;
  const changed: CoverField[] = [];
  // Replacements are collected against the original line indices and applied
  // bottom-up so earlier indices stay valid.
  const edits: Array<{ start: number; end: number; lines: string[] }> = [];
  const keys = coverKeys(lines, coverAt + 1, blockEnd);
  const find = (key: string): KeyRange | undefined => keys.find((k) => k.key === key);

  // ── members / mssv
  const membersKey = find('members');
  if (name) {
    if (!membersKey) {
      edits.push({ start: blockEnd, end: blockEnd, lines: memberLines(profile) });
      changed.push('members');
    } else {
      const members = parseMembers(lines, membersKey);
      const placeholder = members.every((m) => PLACEHOLDER_MEMBER.test(m.name.trim()));
      if (pristine || placeholder) {
        edits.push({ start: membersKey.start, end: membersKey.end, lines: memberLines(profile) });
        changed.push('members');
      } else if (mssv) {
        const me = members.find((m) => norm(m.name) === norm(name));
        if (me && !me.mssv.trim()) {
          if (me.mssvLine >= 0) {
            const indent = /^(\s*)/.exec(lines[me.mssvLine] ?? '')?.[1] ?? '      ';
            const dash = /^(\s*-\s*)mssv:/.exec(lines[me.mssvLine] ?? '')?.[1];
            edits.push({ start: me.mssvLine, end: me.mssvLine + 1, lines: [`${dash ?? indent}mssv: ${q(mssv)}`] });
          } else if (/^\s{2,}-\s*(?:name|hoten):/.test(lines[me.line] ?? '')) {
            edits.push({ start: me.line + 1, end: me.line + 1, lines: [`      mssv: ${q(mssv)}`] });
          }
          if (me.mssvLine >= 0 || /^\s{2,}-\s*(?:name|hoten):/.test(lines[me.line] ?? '')) changed.push('mssv');
        }
      }
    }
  }

  // ── faculty
  const facultyKey = find('faculty');
  if (faculty) {
    if (!facultyKey) {
      const after = find('school') ?? find('university');
      const at = after ? after.end : coverAt + 1;
      edits.push({ start: at, end: at, lines: [`  faculty: ${q(faculty)}`] });
      changed.push('faculty');
    } else if (pristine || PLACEHOLDER_FACULTY.test(unquote(facultyKey.value))) {
      if (unquote(facultyKey.value) !== faculty) {
        edits.push({ start: facultyKey.start, end: facultyKey.start + 1, lines: [`  faculty: ${q(faculty)}`] });
        changed.push('faculty');
      }
    }
  }

  // ── major (stored for future templates / metadata; not printed today)
  const majorKey = find('major');
  if (major) {
    if (!majorKey) {
      const anchor = facultyKey ?? find('school') ?? find('university');
      const at = anchor ? anchor.start + 1 : coverAt + 1;
      edits.push({ start: at, end: at, lines: [`  major: ${q(major)}`] });
      changed.push('major');
    } else if ((pristine || unquote(majorKey.value) === '') && unquote(majorKey.value) !== major) {
      edits.push({ start: majorKey.start, end: majorKey.start + 1, lines: [`  major: ${q(major)}`] });
      changed.push('major');
    }
  }

  if (!edits.length) return unchanged;

  // Bottom-up so earlier indices stay valid. At the same index a replacement
  // goes first (an insert applied before it would be spliced away), and
  // inserts go in reverse push order so they end up in push order.
  const order = edits
    .map((e, i) => ({ ...e, i }))
    .sort(
      (a, b) =>
        b.start - a.start ||
        Number(b.end > b.start) - Number(a.end > a.start) ||
        b.i - a.i,
    );
  const next = lines.slice();
  for (const e of order) next.splice(e.start, e.end - e.start, ...e.lines);
  const rebuilt = next.join('\n') + src.slice(frontMatter.length);
  return rebuilt === src ? unchanged : { source: rebuilt, changed };
}
