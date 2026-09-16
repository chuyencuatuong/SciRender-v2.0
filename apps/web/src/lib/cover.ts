import type { TemplateDescriptor } from '@scirender/template-engine';
import { splitFrontMatter } from './cards';

/**
 * A cover-page template is useless without the data it prints.
 *
 * Switching to the HCMUT report template used to leave the document with a
 * cover layout and nothing to put on it, so the first page came out blank-ish
 * and the writer had to know the YAML by heart. Here the missing block is
 * filled in with the faculty's own wording and clearly marked placeholders.
 *
 * P1 — this only ever *adds* a `cover:` block that was not there. Nothing the
 * author already wrote is edited, reordered or removed; a document that already
 * has a cover is returned untouched.
 */
export function needsCover(source: string, template: TemplateDescriptor): boolean {
  if (template.cover.layout === 'none') return false;
  const { frontMatter } = splitFrontMatter(source.replace(/\r\n?/g, '\n'));
  if (!frontMatter) return true;
  return !/^cover:\s*$/m.test(frontMatter) && !/^cover:\s*\S/m.test(frontMatter);
}

function coverBlock(template: TemplateDescriptor, names: string[]): string {
  const hcmut = template.id === 'hcmut-btl' || template.cover.layout === 'hcmut';
  const members = names.length
    ? names.map((n) => `    - name: ${n}\n      mssv: ""`).join('\n')
    : '    - name: Họ và tên thành viên\n      mssv: "0000000"';
  return [
    'cover:',
    `  university: ${hcmut ? 'Đại học Quốc gia TP. Hồ Chí Minh' : 'Tên đại học'}`,
    `  school: ${hcmut ? 'Trường Đại học Bách khoa' : 'Tên trường'}`,
    '  faculty: Khoa ...',
    `  reportType: ${hcmut ? 'Báo cáo bài tập lớn' : 'Báo cáo'}`,
    '  course: Môn ...',
    '  class: L01',
    '  group: Nhóm 1',
    '  advisor: ',
    '  place: Tp. HCM',
    ...(hcmut ? ['  logo: asset:logo-bk'] : []),
    '  members:',
    members,
  ].join('\n');
}

/** Names already declared in `authors:`, so the cover starts from real people. */
function authorNames(frontMatter: string): string[] {
  const out: string[] = [];
  const authors = /^authors:\s*$([\s\S]*?)(?=^\S|\Z)/m.exec(frontMatter);
  if (!authors) return out;
  for (const line of (authors[1] ?? '').split('\n')) {
    const m = /^\s*-\s*(?:name:\s*)?(.+?)\s*$/.exec(line);
    if (m && m[1] && !m[1].includes(':')) out.push(m[1]);
  }
  return out;
}

export function withCover(source: string, template: TemplateDescriptor): string {
  const src = source.replace(/\r\n?/g, '\n');
  if (!needsCover(src, template)) return src;

  const { frontMatter, bodyOffset } = splitFrontMatter(src);
  const block = coverBlock(template, authorNames(frontMatter));

  if (!frontMatter) {
    const title = /^#\s+(.+)$/m.exec(src)?.[1]?.trim() ?? 'TÊN ĐỀ TÀI';
    return `---\ntitle: ${title}\ntemplate: ${template.id}\nlanguage: vi\n${block}\n---\n\n${src.trimStart()}`;
  }

  // Put the block at the end of the existing front matter, before its closing
  // `---`, leaving every other key exactly where the author left it.
  const inner = frontMatter.replace(/^---\n/, '').replace(/\n---$/, '');
  const head = `---\n${inner.replace(/\s+$/, '')}\n${block}\n---`;
  return head + src.slice(bodyOffset - (src.slice(0, bodyOffset).endsWith('\n') ? 0 : 0));
}
