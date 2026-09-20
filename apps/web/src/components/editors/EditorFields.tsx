import { useEffect, useRef, useState } from 'react';

export function LabelField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
      nhãn
      <input
        className="sr-input h-6 min-w-0 flex-1 font-mono text-[11px]"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.trim())}
      />
    </label>
  );
}

export function CaptionField({
  caption,
  label,
  labelHint,
  onChange,
}: {
  caption: string;
  label: string;
  labelHint: string;
  onChange: (caption: string, label: string) => void;
}): JSX.Element {
  const [local, setLocal] = useState(caption);
  const last = useRef(caption);
  useEffect(() => {
    if (caption !== last.current) {
      last.current = caption;
      setLocal(caption);
    }
  }, [caption]);

  return (
    <div className="space-y-1.5">
      <input
        className="sr-input"
        value={local}
        placeholder="Chú thích"
        aria-label="Chú thích"
        onChange={(e) => {
          setLocal(e.target.value);
          last.current = e.target.value;
          onChange(e.target.value, label);
        }}
      />
      <LabelField value={label} placeholder={labelHint} onChange={(l) => onChange(caption, l)} />
    </div>
  );
}
