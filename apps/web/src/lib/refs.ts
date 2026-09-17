import { FileCode2, Hash, Image, Sigma, Table2, Workflow, type LucideIcon } from 'lucide-react';
import type { RefKind } from '@scirender/ast';

/**
 * The one place that names and draws the six kinds of labelled object
 * (`@fig:`/`@tbl:`/`@eq:`/`@sec:`/`@dia:`/`@lst:`). The Document Objects panel
 * and the `@`-mention popover in the editor both read from here — one mapping
 * instead of two copies drifting apart (P4).
 */
export const REF_KIND_LABEL: Record<RefKind, string> = {
  fig: 'Hình',
  tbl: 'Bảng',
  eq: 'Công thức',
  sec: 'Đề mục',
  dia: 'Sơ đồ',
  lst: 'Mã nguồn',
};

export const REF_KIND_ICON: Record<RefKind, LucideIcon> = {
  fig: Image,
  tbl: Table2,
  eq: Sigma,
  sec: Hash,
  dia: Workflow,
  lst: FileCode2,
};

/** Stable draw order — figures and tables first (what a report cites most). */
export const REF_KIND_ORDER: RefKind[] = ['fig', 'tbl', 'eq', 'sec', 'dia', 'lst'];
