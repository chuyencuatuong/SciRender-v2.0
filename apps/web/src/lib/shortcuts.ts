export interface ShortcutDefinition {
  id: string;
  label: string;
  keys: string[];
  description: string;
  group: 'Soạn thảo' | 'Tài liệu' | 'Điều hướng';
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: 'command-palette', label: 'Command Palette', keys: ['Ctrl+Shift+P', 'F1'], description: 'Mở bảng lệnh nhanh', group: 'Điều hướng' },
  { id: 'hyperlink', label: 'Chèn / sửa liên kết', keys: ['Ctrl+K'], description: 'Chèn hoặc chỉnh Markdown link', group: 'Soạn thảo' },
  { id: 'heading-1', label: 'Đề mục 1', keys: ['Ctrl+Alt+1'], description: 'Đổi khối hiện tại thành Heading 1', group: 'Soạn thảo' },
  { id: 'heading-2', label: 'Đề mục 2', keys: ['Ctrl+Alt+2'], description: 'Đổi khối hiện tại thành Heading 2', group: 'Soạn thảo' },
  { id: 'heading-3', label: 'Đề mục 3', keys: ['Ctrl+Alt+3'], description: 'Đổi khối hiện tại thành Heading 3', group: 'Soạn thảo' },
  { id: 'paragraph', label: 'Văn bản thường', keys: ['Ctrl+Alt+0'], description: 'Bỏ cấp heading, trở về đoạn văn', group: 'Soạn thảo' },
  { id: 'clean-paste', label: 'Dán sạch', keys: ['Ctrl+Shift+V'], description: 'Chỉ dán plain text, loại HTML/style rác', group: 'Soạn thảo' },
  { id: 'page-break', label: 'Ngắt trang', keys: ['Ctrl+Enter'], description: 'Chèn ngắt trang tại vị trí đang gõ', group: 'Soạn thảo' },
  { id: 'undo', label: 'Hoàn tác', keys: ['Ctrl+Z'], description: 'Hoàn tác thay đổi Canvas', group: 'Soạn thảo' },
  { id: 'redo', label: 'Làm lại', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], description: 'Làm lại thay đổi Canvas', group: 'Soạn thảo' },
  { id: 'duplicate', label: 'Nhân bản khối', keys: ['Ctrl+D'], description: 'Nhân bản khối đang chọn', group: 'Soạn thảo' },
  { id: 'move-up-down', label: 'Di chuyển khối', keys: ['Alt+↑', 'Alt+↓'], description: 'Di chuyển khối lên / xuống', group: 'Soạn thảo' },
  { id: 'shortcuts', label: 'Bảng phím tắt', keys: ['Ctrl+/', '?'], description: 'Mở bảng tra cứu phím tắt', group: 'Điều hướng' },
  { id: 'print', label: 'In / Lưu PDF', keys: ['Ctrl+P'], description: 'Mở hộp thoại in', group: 'Tài liệu' },
];

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false;
  const el = target instanceof HTMLElement ? target : null;
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el?.isContentEditable === true;
}

export function isTypingShortcutTarget(target: EventTarget | null): boolean {
  return isEditableTarget(target);
}

/**
 * Registers a global keyboard listener in capture phase. Capture is deliberate:
 * editor controls may consume/bubble key events before a window bubble listener
 * gets a chance to see them.
 */
export function listenForShortcuts(handler: (event: KeyboardEvent) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}

export function keyLabel(keys: string[]): string {
  return keys.join('  /  ');
}

function keyIs(e: { key: string; code?: string }, expected: string, code?: string): boolean {
  return e.key.toLowerCase() === expected.toLowerCase() || (!!code && e.code === code);
}

export function matchesShortcut(
  e: {
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    key: string;
    code?: string;
    target: EventTarget | null;
  },
  id: string,
): boolean {
  const mod = e.ctrlKey || e.metaKey;
  switch (id) {
    case 'command-palette':
      return (mod && e.shiftKey && keyIs(e, 'p', 'KeyP')) || e.key === 'F1';
    case 'hyperlink':
      return mod && !e.shiftKey && !e.altKey && keyIs(e, 'k', 'KeyK');
    case 'heading-1':
      return mod && e.altKey && !e.shiftKey && keyIs(e, '1', 'Digit1');
    case 'heading-2':
      return mod && e.altKey && !e.shiftKey && keyIs(e, '2', 'Digit2');
    case 'heading-3':
      return mod && e.altKey && !e.shiftKey && keyIs(e, '3', 'Digit3');
    case 'paragraph':
      return mod && e.altKey && !e.shiftKey && keyIs(e, '0', 'Digit0');
    case 'clean-paste':
      return mod && e.shiftKey && !e.altKey && keyIs(e, 'v', 'KeyV');
    case 'page-break':
      return mod && !e.shiftKey && !e.altKey && e.key === 'Enter';
    case 'undo':
      return mod && !e.shiftKey && !e.altKey && keyIs(e, 'z', 'KeyZ');
    case 'redo':
      return mod && !e.altKey && (keyIs(e, 'y', 'KeyY') || (e.shiftKey && keyIs(e, 'z', 'KeyZ')));
    case 'duplicate':
      return mod && !e.shiftKey && !e.altKey && keyIs(e, 'd', 'KeyD');
    case 'move-up-down':
      return !mod && !e.shiftKey && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
    case 'print':
      return mod && !e.shiftKey && !e.altKey && keyIs(e, 'p', 'KeyP');
    case 'shortcuts':
      return (mod && (e.key === '/' || e.key === '?')) || (!isEditableTarget(e.target) && e.key === '?');
    default:
      return false;
  }
}
