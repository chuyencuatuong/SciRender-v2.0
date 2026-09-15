import type { DocumentNode } from '@scirender/ast';
import { resolveFigureSrc, type AssetMap } from '@scirender/figure-engine';
import type { TemplateDescriptor } from '@scirender/template-engine';
import { escapeAttr, escapeHtml, safeUrl } from './escape.js';

/**
 * Cover pages.
 *
 * The HCMUT layout follows the faculty's sample sheet: organisation block,
 * logo, report type, topic title, class/group and advisor on the outer cover;
 * the same header plus the member list on the inner cover (phụ bìa). Neither
 * page carries a page number.
 */
export function renderCoverPages(
  doc: DocumentNode,
  t: TemplateDescriptor,
  assets: AssetMap,
): string[] {
  if (t.cover.layout !== 'hcmut') return [];
  const c = doc.meta.cover;
  if (!c) return [];

  const org = [c.university, c.school, c.faculty]
    .filter((x): x is string => Boolean(x && x.trim()))
    .map((x) => escapeHtml(x))
    .join('<br>');

  const logoHtml = logo(c.logo, assets, t);
  const dateLine = [c.place, doc.meta.date].filter(Boolean).join(', ');

  const head = `${org ? `<div class="sr-cover-org">${org}</div>` : ''}${logoHtml}${
    c.reportType ? `<div class="sr-cover-type">${escapeHtml(c.reportType)}</div>` : ''
  }${c.course ? `<div class="sr-cover-course">${escapeHtml(c.course)}</div>` : ''}${
    doc.meta.title ? `<div class="sr-cover-title">${escapeHtml(doc.meta.title)}</div>` : ''
  }`;

  const groupLine = [c.class ? `LỚP ${c.class}` : '', c.group ?? '']
    .filter(Boolean)
    .join(', ');

  const outer = `<div class="sr-cover" data-sr-id="cover-outer" data-sr-type="cover">
${head}
${groupLine ? `<div class="sr-cover-meta">${escapeHtml(groupLine)}:</div>` : ''}
${c.advisor ? `<div class="sr-cover-advisor">GVHD: ${escapeHtml(c.advisor)}</div>` : ''}
${dateLine ? `<div class="sr-cover-place">${escapeHtml(dateLine)}</div>` : ''}
</div>`;

  const pages = [outer];

  if (t.cover.innerCover) {
    const members = c.members.length
      ? `<div class="sr-cover-members">${c.members
          .map(
            (m, i) =>
              `<span>${i + 1}. ${escapeHtml(m.name)}</span><span>${
                m.studentId ? `MSSV: ${escapeHtml(m.studentId)}` : ''
              }</span>`,
          )
          .join('')}</div>`
      : '';
    const inner = `<div class="sr-cover" data-sr-id="cover-inner" data-sr-type="cover">
${head}
${c.group ? `<div class="sr-cover-group">${escapeHtml(c.group)}:</div>` : ''}
${members}
${dateLine ? `<div class="sr-cover-place">${escapeHtml(dateLine)}</div>` : ''}
</div>`;
    pages.push(inner);
  }

  return pages;
}

function logo(src: string | undefined, assets: AssetMap, t: TemplateDescriptor): string {
  if (!src) return '';
  const resolved = resolveFigureSrc(src, assets);
  const url = safeUrl(resolved.url);
  if (!url) {
    return `<div class="sr-unknown">Thiếu logo: ${escapeHtml(src)}</div>`;
  }
  return `<div class="sr-cover-logo" style="height:${escapeAttr(
    t.cover.logoHeight,
  )}"><img src="${escapeAttr(url)}" alt="Logo"></div>`;
}
