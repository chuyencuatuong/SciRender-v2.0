import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  minRows?: number;
  ariaLabel?: string;
}

/** A textarea that grows with its content — a card must never scroll inside. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  mono = false,
  minRows = 1,
  ariaLabel,
}: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[1.55] text-ink-800 outline-none placeholder:text-ink-400 ${
        mono ? 'font-mono text-[12px]' : ''
      }`}
    />
  );
}
