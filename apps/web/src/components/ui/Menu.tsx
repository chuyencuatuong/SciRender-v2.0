import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { POP_IN, useReducedMotion } from '~/lib/motion';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  label: string;
  icon?: ReactNode;
  items: Array<MenuItem | 'separator'>;
  align?: 'left' | 'right';
  variant?: 'plain' | 'primary';
  width?: number;
}

/**
 * One dropdown used everywhere, so a menu behaves the same wherever it appears:
 * click or Enter opens, ↑/↓ move, Enter picks, Escape closes and returns focus.
 */
export function Menu({
  label,
  icon,
  items,
  align = 'right',
  variant = 'plain',
  width = 220,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const reduced = useReducedMotion();

  const usable = items.filter((i): i is MenuItem => i !== 'separator' && !i.disabled);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => {
          const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
          return (next + usable.length) % Math.max(1, usable.length);
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = usable[active];
        if (item) {
          setOpen(false);
          item.onSelect();
        }
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, active, usable]);

  let cursor = -1;

  return (
    <div ref={hostRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActive(0);
          setOpen((v) => !v);
        }}
        className={variant === 'primary' ? 'sr-btn-primary' : 'sr-btn'}
      >
        {icon}
        {label}
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            style={{ width }}
            initial={reduced ? false : POP_IN.initial}
            animate={POP_IN.animate}
            exit={reduced ? undefined : POP_IN.exit}
            transition={POP_IN.transition}
            className={`absolute z-40 mt-1 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {items.map((item, i) => {
              if (item === 'separator') {
                return <div key={`sep-${i}`} className="my-1 h-px bg-ink-100" />;
              }
              if (!item.disabled) cursor++;
              const isActive = !item.disabled && cursor === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onMouseEnter={() => {
                    if (!item.disabled) setActive(usable.findIndex((u) => u.id === item.id));
                  }}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition disabled:opacity-40 ${
                    item.danger ? 'text-flag-600' : 'text-ink-800'
                  } ${isActive ? 'bg-sky-50' : ''}`}
                >
                  <span className="grid w-4 place-items-center text-ink-400">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.hint ? (
                    <kbd className="rounded bg-ink-100 px-1 text-[10px] text-ink-500">
                      {item.hint}
                    </kbd>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
