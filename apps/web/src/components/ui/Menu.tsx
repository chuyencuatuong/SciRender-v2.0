import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { POP_IN, useReducedMotion } from '~/lib/motion';

export interface MenuItem {
  id: string;
  label: string;
  /** One line under the label — use it when a choice needs a caveat, not decoration. */
  description?: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | 'separator';

interface Props {
  label: string;
  icon?: ReactNode;
  items: MenuEntry[];
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
  const ctl = useMenuControl(items);
  return (
    <div ref={ctl.hostRef} className="relative">
      <button
        ref={ctl.buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={ctl.open}
        onClick={ctl.toggle}
        className={variant === 'primary' ? 'sr-btn-primary' : 'sr-btn-ghost'}
      >
        {icon}
        {label}
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${ctl.open ? 'rotate-180' : ''}`}
        />
      </button>
      <MenuList ctl={ctl} items={items} width={width} align={align} />
    </div>
  );
}

interface SplitProps extends Props {
  onPrimary: () => void;
  primaryTitle?: string;
  disabled?: boolean;
}

/**
 * A split button: the most common action is one click away, the alternatives
 * are one more. It exists because "In / PDF" used to be a single button doing
 * one of two things people actually mean separately.
 */
export function SplitMenu({
  label,
  icon,
  items,
  onPrimary,
  primaryTitle,
  disabled = false,
  width = 260,
  align = 'right',
}: SplitProps): JSX.Element {
  const ctl = useMenuControl(items);
  return (
    <div ref={ctl.hostRef} className="relative">
      <div className="flex items-stretch overflow-hidden rounded-[9px] shadow-[0_1px_2px_rgba(11,44,127,.35),0_6px_16px_-6px_rgba(11,44,127,.5)]">
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          title={primaryTitle}
          className="inline-flex h-[34px] items-center gap-1.5 bg-gradient-to-b from-[#14409f] to-deep-600 px-3 text-[12.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
        <button
          ref={ctl.buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={ctl.open}
          aria-label="Thêm cách xuất"
          onClick={ctl.toggle}
          className="inline-flex h-[34px] items-center border-l border-white/25 bg-gradient-to-b from-[#14409f] to-deep-600 px-2 text-white transition hover:brightness-110"
        >
          <ChevronDown
            size={13}
            className={`transition-transform duration-150 ${ctl.open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      <MenuList ctl={ctl} items={items} width={width} align={align} />
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

interface Ctl {
  open: boolean;
  active: number;
  setActive: (n: number) => void;
  close: () => void;
  toggle: () => void;
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  buttonRef: React.MutableRefObject<HTMLButtonElement | null>;
  usable: MenuItem[];
}

function useMenuControl(items: MenuEntry[]): Ctl {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
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

  return {
    open,
    active,
    setActive,
    close: () => setOpen(false),
    toggle: () => {
      setActive(0);
      setOpen((v) => !v);
    },
    hostRef,
    buttonRef,
    usable,
  };
}

function MenuList({
  ctl,
  items,
  width,
  align,
}: {
  ctl: Ctl;
  items: MenuEntry[];
  width: number;
  align: 'left' | 'right';
}): JSX.Element {
  const reduced = useReducedMotion();
  let cursor = -1;
  return (
    <AnimatePresence>
      {ctl.open ? (
        <motion.div
          role="menu"
          style={{ width }}
          initial={reduced ? false : POP_IN.initial}
          animate={POP_IN.animate}
          exit={reduced ? undefined : POP_IN.exit}
          transition={POP_IN.transition}
          className={`sr-menu mt-1.5 origin-top ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, i) => {
            if (item === 'separator') {
              return <div key={`sep-${i}`} className="my-1 h-px bg-black/[0.06]" />;
            }
            if (!item.disabled) cursor++;
            const isActive = !item.disabled && cursor === ctl.active;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onMouseEnter={() => {
                  if (!item.disabled) ctl.setActive(ctl.usable.findIndex((u) => u.id === item.id));
                }}
                onClick={() => {
                  ctl.close();
                  item.onSelect();
                }}
                className={`sr-menu-item items-start ${item.danger ? 'text-flag-600' : ''} ${
                  isActive ? 'bg-sky-50/70' : ''
                }`}
              >
                <span className="mt-[2px] grid w-4 place-items-center text-ink-400">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="flex-1">{item.label}</span>
                    {item.hint ? <kbd className="sr-kbd">{item.hint}</kbd> : null}
                  </span>
                  {item.description ? (
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
