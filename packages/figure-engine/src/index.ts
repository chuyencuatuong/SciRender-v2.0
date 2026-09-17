import type { Diagnostic, FigureNode } from '@scirender/ast';

/** name -> resolvable URL (blob:, data:, https:). Provided by the storage layer. */
export type AssetMap = Record<string, string>;

export interface ResolvedFigureSrc {
  url: string;
  kind: 'asset' | 'remote' | 'data' | 'relative';
  missing: boolean;
}

/**
 * Figures reference assets by logical name (`asset:diagram-1`) so that a
 * document stays portable: the AST never stores a blob URL (P3).
 */
export function resolveFigureSrc(src: string, assets: AssetMap): ResolvedFigureSrc {
  const trimmed = src.trim();
  if (trimmed.startsWith('asset:')) {
    const name = trimmed.slice(6);
    const url = assets[name];
    return { url: url ?? '', kind: 'asset', missing: !url };
  }
  if (/^data:/i.test(trimmed)) return { url: trimmed, kind: 'data', missing: false };
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed, kind: 'remote', missing: false };
  const url = assets[trimmed];
  return { url: url ?? trimmed, kind: 'relative', missing: !url };
}

export function figureStyle(attrs: Record<string, string>): string {
  const parts: string[] = [];
  const width = attrs.width;
  const height = attrs.height;
  if (width) parts.push(`width:${normaliseLength(width)}`);
  if (height) parts.push(`height:${normaliseLength(height)}`);
  return parts.join(';');
}

function normaliseLength(v: string): string {
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return `${t}px`;
  return t;
}

export function checkFigure(node: FigureNode, assets: AssetMap): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!node.src.trim()) {
    out.push({
      code: 'SR-F001',
      severity: 'error',
      stage: 'asset',
      nodeId: node.id,
      message: 'Hình không có đường dẫn nguồn.',
      position: node.position,
    });
  } else {
    const resolved = resolveFigureSrc(node.src, assets);
    if (resolved.missing) {
      out.push({
        code: 'SR-F002',
        severity: 'error',
        stage: 'asset',
        nodeId: node.id,
        message: `Không tìm thấy tài nguyên hình "${node.src}".`,
        hint: 'Tải hình lên tab Tài nguyên, hoặc dùng URL https:// hay data: hợp lệ.',
        position: node.position,
      });
    }
  }
  if (!node.caption.length && !node.alt.trim()) {
    out.push({
      code: 'SR-F003',
      severity: 'warning',
      stage: 'asset',
      nodeId: node.id,
      message: 'Hình chưa có chú thích (caption).',
      hint: 'Viết chú thích trong alt: ![Chú thích](asset:ten-hinh), hoặc thêm dòng ": Chú thích" ngay dưới hình.',
      position: node.position,
    });
  }
  return out;
}

export * from './chart.js';
