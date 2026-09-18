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
  const el = target as HTMLElement | null;
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el?.isContentEditable === true;
}

export function isTypingShortcutTarget(target: EventTarget | null): boolean {
  return isEditableTarget(target);
}

export function keyLabel(keys: string[]): string {
  return keys.join('  /  ');
}

export function matchesShortcut(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; key: string; target: EventTarget | null }, id: string): boolean {
  const mod = e.ctrlKey || e.metaKey;
  switch (id) {
    case 'command-palette':
      return (mod && e.shiftKey && e.key.toLowerCase() === 'p') || e.key === 'F1';
    case 'hyperlink':
      return mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k';
    case 'clean-paste':
      return mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v';
    case 'page-break':
      return mod && !e.shiftKey && e.key === 'Enter';
    case 'undo':
      return mod && !e.shiftKey && e.key.toLowerCase() === 'z';
    case 'redo':
      return mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'));
    case 'duplicate':
      return mod && !e.shiftKey && e.key.toLowerCase() === 'd';
    case 'print':
      return mod && !e.shiftKey && e.key.toLowerCase() === 'p';
    case 'shortcuts':
      return (mod && e.key === '/') || (!isEditableTarget(e.target) && e.key === '?');
    default:
      return false;
  }
}
