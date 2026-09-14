export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only http(s), data:image and blob: URLs are emitted. Everything else is dropped. */
export function safeUrl(url: string): string {
  const t = url.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(t)) return t;
  if (/^data:image\//i.test(t)) return t;
  if (/^blob:/i.test(t)) return t;
  return '';
}
