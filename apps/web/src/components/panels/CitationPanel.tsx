import { useMemo, useRef, useState } from 'react';
import { BookOpenText, Check, FileUp, Plus, Search } from 'lucide-react';
import type { BibEntry } from '@scirender/ast';
import { foldDiacritics } from '~/lib/cards';
import type { RenderState } from '~/hooks/useRender';
import { useStore } from '~/state/store';

interface Props {
  render: RenderState;
}

export function CitationPanel({ render }: Props): JSX.Element {
  const importBibTeX = useStore((s) => s.importBibTeX);
  const requestCitationInsert = useStore((s) => s.requestCitationInsert);
  const overrides = useStore((s) => s.overrides);
  const setOverrides = useStore((s) => s.setOverrides);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [paste, setPaste] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const entries = render.result?.document.meta.bibliography ?? [];
  const filtered = useMemo(() => {
    const q = foldDiacritics(query.trim());
    if (!q) return entries;
    return entries.filter((entry) => {
      const hay = foldDiacritics(`${entry.key} ${entry.authors ?? ''} ${entry.title ?? ''} ${entry.year ?? ''}`);
      return q.split(/\s+/).every((word) => hay.includes(word));
    });
  }, [entries, query]);

  const currentStyle = render.result?.template.descriptor.citation.style ?? 'numeric';

  const applyBib = (text: string): void => {
    const result = importBibTeX(text);
    const summary = result.errors.length
      ? `Có ${result.errors.length} lỗi; đã nạp ${result.total} mục.`
      : `Đã nạp ${result.total} mục · thêm ${result.added} · cập nhật ${result.updated}.`;
    setMessage(summary);
    if (!result.errors.length) setPaste('');
  };

  const toggle = (key: string): void => {
    setSelected((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
  };

  const insertKeys = (keys: string[]): void => {
    requestCitationInsert(keys);
    setMessage(`Đã chuẩn bị ${keys.length} trích dẫn tại vị trí con trỏ đang hoạt động.`);
  };

  return (
    <div className="sr-scroll flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2">
        <BookOpenText size={16} className="text-deep-600" />
        <div>
          <div className="text-[13px] font-semibold text-ink-800">Tài liệu tham khảo</div>
          <div className="text-[10.5px] text-ink-400">BibTeX · IEEE / APA · local-first</div>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 bg-[var(--sr-surface)] p-2.5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-ink-700">Nạp .bib</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-deep-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-deep-700"
            onClick={() => inputRef.current?.click()}
          >
            <FileUp size={12} /> Tải file
          </button>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".bib,text/plain,application/x-bibtex"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then(applyBib);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/@(?:article|book|inproceedings|misc)\s*[({]/i.test(text)) {
              e.preventDefault();
              setPaste(text);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.bib'));
            if (!file) return;
            void file.text().then(applyBib);
          }}
          rows={5}
          spellCheck={false}
          placeholder="Dán BibTeX vào đây… hoặc kéo thả file .bib"
          className="w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-2 font-mono text-[10.5px] leading-[1.45] text-ink-700 outline-none focus:border-deep-400"
        />
        <button
          type="button"
          disabled={!paste.trim()}
          onClick={() => applyBib(paste)}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-deep-200 bg-deep-50 px-2 py-1 text-[11px] font-medium text-deep-700 disabled:opacity-40"
        >
          <Plus size={12} /> Nạp BibTeX
        </button>
        {message ? <div className="mt-2 text-[10.5px] text-ink-500">{message}</div> : null}
      </div>

      <div className="mt-3 rounded-xl border border-ink-200 bg-[var(--sr-surface)] p-2.5 shadow-card">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Tìm trong ${entries.length} tài liệu…`}
              className="sr-input h-7 !pl-7 text-[11px]"
            />
          </div>
          <select
            aria-label="Kiểu trích dẫn"
            value={currentStyle}
            onChange={(e) => {
              const style = e.target.value as 'numeric' | 'author-year';
              setOverrides({
                citation: {
                  style,
                  open: style === 'author-year' ? '(' : '[',
                  close: style === 'author-year' ? ')' : ']',
                  references: style === 'author-year' ? 'apa' : 'ieee',
                },
              });
            }}
            className="sr-input h-7 !w-[100px] text-[11px]"
          >
            <option value="numeric">IEEE [1]</option>
            <option value="author-year">APA</option>
          </select>
        </div>

        {selected.length ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-sky-50 px-2 py-1.5 text-[10.5px] text-deep-700">
            <span>Đã chọn {selected.length}</span>
            <button type="button" className="font-semibold underline" onClick={() => insertKeys(selected)}>
              Chèn [@…]
            </button>
          </div>
        ) : null}

        <div className="space-y-1">
          {filtered.map((entry) => {
            const on = selected.includes(entry.key);
            return (
              <div key={entry.key} className="rounded-lg border border-transparent px-2 py-2 hover:border-ink-200 hover:bg-ink-50">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-label={on ? `Bỏ chọn ${entry.key}` : `Chọn ${entry.key}`}
                    onClick={() => toggle(entry.key)}
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-deep-600 bg-deep-600 text-white' : 'border-ink-300 text-transparent'}`}
                  >
                    <Check size={10} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[10.5px] font-semibold text-deep-700">{entry.key}</span>
                      {entry.year ? <span className="text-[10px] text-ink-400">{entry.year}</span> : null}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-700">{entry.title ?? '(chưa có tiêu đề)'}</div>
                    <div className="mt-0.5 truncate text-[10px] text-ink-400">{entry.authors ?? 'Không rõ tác giả'}</div>
                  </div>
                  <button
                    type="button"
                    title="Chèn trích dẫn tại vị trí con trỏ"
                    onClick={() => insertKeys([entry.key])}
                    className="rounded-md border border-ink-200 px-1.5 py-1 text-[10px] text-ink-500 hover:border-deep-300 hover:text-deep-700"
                  >
                    Chèn
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!filtered.length ? (
          <div className="py-5 text-center text-[11px] text-ink-400">
            {entries.length ? 'Không tìm thấy tài liệu.' : 'Chưa có tài liệu tham khảo. Hãy nạp file .bib.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function citationEntries(result: RenderState['result']): BibEntry[] {
  return result?.document.meta.bibliography ?? [];
}
