import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUTS, matchesShortcut, type ShortcutDefinition } from '~/lib/shortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function ShortcutCheatSheet({ open, onClose, onToggle }: Props): JSX.Element | null {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (matchesShortcut(e, 'shortcuts')) {
        e.preventDefault();
        onToggle();
      }
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onToggle]);

  if (!open) return null;
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Bảng phím tắt"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative z-10 flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-ink-900/[0.1] bg-[var(--sr-surface)] shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-ink-900/[0.07] px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-500/10 text-deep-600"><Keyboard size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink-900">Phím tắt SciRender</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-400">Registry tập trung · thiết kế theo muscle memory của Word</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-900/[0.05] hover:text-ink-800"><X size={16} /></button>
        </header>
        <div className="sr-scroll flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-400">{group}</h3>
                <div className="divide-y divide-ink-900/[0.05] overflow-hidden rounded-xl border border-ink-900/[0.06]">
                  {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => <ShortcutRow key={shortcut.id} shortcut={shortcut} />)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-ink-800">{shortcut.label}</div>
        <div className="mt-0.5 text-[10.5px] text-ink-400">{shortcut.description}</div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {shortcut.keys.map((key) => <kbd key={key} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">{key}</kbd>)}
      </div>
    </div>
  );
}
