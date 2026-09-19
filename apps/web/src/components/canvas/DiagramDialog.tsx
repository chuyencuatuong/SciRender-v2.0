import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Code2, Maximize2, Minus, Plus, Save, Sparkles, X } from 'lucide-react';
import type { BibEntry, LabelRecord } from '@scirender/ast';
import { applyDiagramViewport, DIAGRAM_PRESETS, getSvgIntrinsicSize, renderDiagramSvg, type DiagramStudioCurve, type DiagramStudioTheme } from '~/lib/diagram-studio';
import type { DiagramForm } from '~/lib/card-forms';

interface Props {
  open: boolean;
  form: DiagramForm;
  bibliography?: BibEntry[];
  labels?: Record<string, LabelRecord>;
  onChange: (patch: Partial<DiagramForm>) => void;
  onSave: (options: { nodeSpacing: number; rankSpacing: number; viewX: number; viewY: number; viewZoom: number }) => Promise<void>;
  onClose: () => void;
  saved?: boolean;
  busy?: boolean;
}

const DIRECTIONS: Array<{ value: 'TB' | 'BT' | 'LR' | 'RL'; label: string; icon: JSX.Element }> = [
  { value: 'TB', label: 'TD', icon: <ArrowDown size={13} /> },
  { value: 'BT', label: 'BT', icon: <ArrowUp size={13} /> },
  { value: 'LR', label: 'LR', icon: <ArrowRight size={13} /> },
  { value: 'RL', label: 'RL', icon: <ArrowLeft size={13} /> },
];

const CURVES: Array<[DiagramStudioCurve, string]> = [['linear', 'Linear'], ['basis', 'Smooth'], ['step', 'Step']];
const THEMES: Array<[DiagramStudioTheme, string]> = [['academic', 'Academic'], ['obsidian', 'Obsidian'], ['blueprint', 'Blueprint']];


function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightMermaid(value: string): string {
  let html = escapeHtml(value);
  html = html.replace(/(^|\n)(\s*)(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|journey)\b/g, '$1$2<span class="sr-code-keyword">$3</span>');
  html = html.replace(/\b(TD|TB|BT|LR|RL)\b/g, '<span class="sr-code-direction">$1</span>');
  html = html.replace(/(-->|---|-.->|==>|===)/g, '<span class="sr-code-edge">$1</span>');
  return html;
}

export function DiagramDialog({ open, form, bibliography, labels, onChange, onSave, onClose, saved, busy }: Props): JSX.Element | null {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [nodeSpacing, setNodeSpacing] = useState(32);
  const [rankSpacing, setRankSpacing] = useState(36);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number; pointerId: number } | null>(null);
  const renderSeq = useRef(0);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!previewRef.current) return;
      const target = e.target;
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
      if (isEditable) return;
      if (e.code === 'Space') previewRef.current.dataset.spacePan = e.type === 'keydown' ? '1' : '0';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (previewRef.current) previewRef.current.dataset.spacePan = '0';
    };
  }, [open]);

  useEffect(() => {
    if (!open || !form.source.trim()) {
      setSvg('');
      setError('');
      setRendering(false);
      return;
    }
    const seq = ++renderSeq.current;
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void renderDiagramSvg(form.source, {
        curve: form.curve,
        theme: form.theme,
        direction: (form.direction || undefined) as 'TB' | 'TD' | 'BT' | 'LR' | 'RL' | undefined,
        nodeSpacing,
        rankSpacing,
      }).then((value) => {
        if (!cancelled && seq === renderSeq.current) {
          setSvg(value);
          setError('');
          setRendering(false);
        }
      }).catch((err: unknown) => {
        if (!cancelled && seq === renderSeq.current) {
          setError(String((err as Error).message));
          setRendering(false);
        }
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, form.source, form.curve, form.theme, form.direction, nodeSpacing, rankSpacing]);

  useEffect(() => {
    if (!open) return;
    const savedX = Number(form.attrs['view-x']);
    const savedY = Number(form.attrs['view-y']);
    const savedZoom = Number(form.attrs['view-zoom']);
    const restoredZoom = Number.isFinite(savedZoom) && savedZoom > 0 ? Math.max(0.25, Math.min(2.5, savedZoom)) : 1;
    const restoredX = Number.isFinite(savedX) ? savedX : 0;
    const restoredY = Number.isFinite(savedY) ? savedY : 0;
    zoomRef.current = restoredZoom;
    panXRef.current = restoredX;
    panYRef.current = restoredY;
    setZoom(restoredZoom);
    setPanX(restoredX);
    setPanY(restoredY);
  }, [open, form.attrs]);

  const clampPan = (nextX: number, nextY: number, nextZoom = zoomRef.current): [number, number] => {
    // A zoomed view can move only across the hidden portion of the original
    // SVG. This gives the exact center-limit in percentage space, rather than
    // allowing arbitrary blank canvas around the diagram.
    const limit = Math.max(0, 50 * (1 - 1 / Math.max(0.25, nextZoom)));
    return [Math.max(-limit, Math.min(limit, nextX)), Math.max(-limit, Math.min(limit, nextY))];
  };

  const setViewport = (nextZoom: number, nextX: number, nextY: number): void => {
    const boundedZoom = Math.max(0.25, Math.min(2.5, nextZoom));
    const [boundedX, boundedY] = clampPan(nextX, nextY, boundedZoom);
    zoomRef.current = boundedZoom;
    panXRef.current = boundedX;
    panYRef.current = boundedY;
    setZoom(boundedZoom);
    setPanX(boundedX);
    setPanY(boundedY);
  };

  const changeZoomAt = (nextZoom: number, anchor?: { x: number; y: number }): void => {
    const bounded = Math.max(0.25, Math.min(2.5, nextZoom));
    const currentZoom = zoomRef.current;
    const currentX = panXRef.current;
    const currentY = panYRef.current;
    if (!anchor || !previewRef.current) {
      setViewport(bounded, currentX, currentY);
      return;
    }
    const rect = previewRef.current.getBoundingClientRect();
    const ax = Math.max(0, Math.min(1, (anchor.x - rect.left) / Math.max(1, rect.width)));
    const ay = Math.max(0, Math.min(1, (anchor.y - rect.top) / Math.max(1, rect.height)));
    // Keep the exact vector-space point under the pointer fixed while the
    // viewBox narrows. Pan percentages encode the view center, so the offset
    // scales by the inverse of the current zoom.
    const oldScale = 1 / Math.max(0.25, currentZoom);
    const nextScale = 1 / bounded;
    const rawX = currentX + (ax - 0.5) * 100 * (nextScale - oldScale);
    const rawY = currentY + (ay - 0.5) * 100 * (nextScale - oldScale);
    setViewport(bounded, rawX, rawY);
  };

  const fitToViewport = (): void => {
    const host = previewRef.current;
    const content = host?.querySelector<HTMLElement>('[data-sr-diagram-content]');
    const size = svg ? getSvgIntrinsicSize(svg) : null;
    if (!host || !content || !size) {
      setViewport(1, 0, 0);
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const svgEl = content.querySelector<SVGSVGElement>('svg');
    const measured = svgEl?.getBoundingClientRect();
    const baseW = measured && measured.width > 0 ? measured.width : size.width;
    const baseH = measured && measured.height > 0 ? measured.height : size.height;
    const availableW = Math.max(64, hostRect.width - 64);
    const availableH = Math.max(64, hostRect.height - 64);
    const nextZoom = Math.max(0.25, Math.min(2.5, availableW / baseW, availableH / baseH));
    setViewport(nextZoom, 0, 0);
  };

  // Use a native, non-passive listener. React's delegated wheel event is too late
  // for browser page-zoom in some Chromium configurations (Ctrl/Cmd+wheel).
  useEffect(() => {
    const host = previewRef.current;
    if (!open || !host) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (!(event.ctrlKey || event.metaKey)) return;
      const factor = Math.exp(-event.deltaY * 0.0015);
      changeZoomAt(zoomRef.current * factor, { x: event.clientX, y: event.clientY });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [open]);

  const beginPan = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const isMiddle = event.button === 1;
    const isSpaceDrag = event.button === 0 && event.currentTarget.dataset.spacePan === '1';
    if (!isMiddle && !isSpaceDrag) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, panX: panXRef.current, panY: panYRef.current, pointerId: 0 };
    setPanning(true);
  };

  const movePan = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const start = dragRef.current;
    if (!start) return;
    const width = Math.max(1, previewRef.current?.getBoundingClientRect().width ?? 1);
    const height = Math.max(1, previewRef.current?.getBoundingClientRect().height ?? 1);
    // Pan is stored as a percentage of the original SVG viewport. At zoom Z,
    // one screen pixel corresponds to 1/Z of that original viewport.
    const scale = 1 / Math.max(0.25, zoomRef.current);
    const nextX = start.panX + (event.clientX - start.clientX) * 100 / width * scale;
    const nextY = start.panY + (event.clientY - start.clientY) * 100 / height * scale;
    const [x, y] = clampPan(nextX, nextY);
    panXRef.current = x;
    panYRef.current = y;
    setPanX(x);
    setPanY(y);
  };

  const endPan = (): void => { dragRef.current = null; setPanning(false); };


  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Technical Diagram Studio" className="sr-diagram-dialog flex max-h-[calc(100dvh-2rem)] min-h-0 w-[min(1400px,96vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--sr-panel)] text-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/12 text-sky-300"><Sparkles size={16} /></div>
          <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">Technical Diagram Studio</div><div className="text-[10.5px] text-white/45">AI-ready Mermaid · SVG · Academic print</div></div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label="Đóng"><X size={16} /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">Code-first / AI import</div>
                <MermaidSourceEditor value={form.source} onChange={(source) => onChange({ source })} />
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.14em] text-white/40"><span>Presets</span><Code2 size={13} /></div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {DIAGRAM_PRESETS.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => onChange({ source: preset.source })} className="rounded-xl border border-white/[.07] bg-white/[.025] p-2.5 text-left hover:border-sky-400/40 hover:bg-sky-400/[.05]">
                      <div className="text-[11.5px] font-medium">{preset.label}</div><div className="mt-0.5 text-[10px] text-white/40">{preset.hint}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                <ControlRow label="Hướng">
                  <div className="flex flex-wrap gap-1">
                    {DIRECTIONS.map((d) => <button key={d.value} type="button" onClick={() => onChange({ direction: d.value })} aria-pressed={form.direction === d.value} className={`sr-diagram-choice inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] ${form.direction === d.value ? 'is-active bg-sky-400/15 ring-1 ring-sky-400/35' : 'hover:bg-white/5'}`}>{d.icon}{d.label}</button>)}
                  </div>
                </ControlRow>
                <ControlRow label="Đường nối">
                  <div className="flex flex-wrap gap-1">{CURVES.map(([v, l]) => <button key={v} type="button" onClick={() => onChange({ curve: v })} aria-pressed={form.curve === v} className={`rounded-full px-2 py-1 text-[10.5px] ${form.curve === v ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/35' : 'text-white/55 hover:bg-white/5'}`}>{l}</button>)}</div>
                </ControlRow>
                <ControlRow label="Theme">
                  <div className="flex flex-wrap gap-1">{THEMES.map(([v, l]) => <button key={v} type="button" onClick={() => onChange({ theme: v })} aria-pressed={form.theme === v} className={`rounded-full px-2 py-1 text-[10.5px] ${form.theme === v ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/35' : 'text-white/55 hover:bg-white/5'}`}>{l}</button>)}</div>
                </ControlRow>
                <RangeRow label="nodeSpacing" value={nodeSpacing} min={8} max={80} onChange={setNodeSpacing} />
                <RangeRow label="rankSpacing" value={rankSpacing} min={8} max={100} onChange={setRankSpacing} />
                <label className="flex items-center gap-2 text-[10.5px] text-white/65"><input type="checkbox" checked={form.landscape} onChange={(e) => onChange({ landscape: e.target.checked })} />Khổ giấy ngang (Landscape)</label>
              </section>

              <section className="space-y-2">
                <input className="w-full rounded-lg border border-white/[.06] bg-[var(--sr-sunk)] px-2.5 py-2 text-[11.5px] text-white outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/20" value={form.caption} placeholder="Chú thích sơ đồ" onChange={(e) => onChange({ caption: e.target.value })} />
                <input className="w-full rounded-lg border border-white/[.06] bg-[var(--sr-sunk)] px-2.5 py-2 font-mono text-[11px] text-white outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/20" value={form.label} placeholder="dia:ten-nhan" onChange={(e) => onChange({ label: e.target.value.trim() })} />
              </section>
            </div>
          </aside>

          <main className="flex min-h-0 flex-col bg-[var(--sr-paper-ground)]">
            <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/[.07] px-3">
              <span className="mr-auto text-[10.5px] font-medium uppercase tracking-[.12em] text-white/35">SVG Preview</span>
              <button type="button" onClick={() => changeZoomAt(zoom - .05)} aria-label="Thu nhỏ" className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5"><Minus size={13}/></button>
              <span className="w-12 text-center font-mono text-[10px] text-white/50">{Math.round(zoom*100)}%</span>
              <button type="button" onClick={() => changeZoomAt(zoom + .05)} aria-label="Phóng to" className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5"><Plus size={13}/></button>
              <button type="button" onClick={() => changeZoomAt(1)} title="Đặt lại zoom" className="ml-1 grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5"><Maximize2 size={13}/></button>
              <button type="button" onClick={fitToViewport} title="Vừa khung" className="grid h-7 px-2 place-items-center rounded-md text-[10px] text-white/50 hover:bg-white/5">Fit</button>
              <span className="ml-2 hidden text-[9.5px] text-white/25 xl:inline">Ctrl/Cmd+wheel · MMB · Space+drag</span>
            </div>
            <div
              ref={previewRef}
              className="min-h-0 flex-1 overflow-hidden p-3"
              onMouseDown={beginPan}
              onMouseMove={movePan}
              onMouseUp={endPan}
              onMouseLeave={endPan}
              style={{ cursor: panning ? 'grabbing' : 'default', touchAction: 'none' }}
            >
              <div className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-white/[.05] bg-white/[.015] p-2">
                {rendering ? <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/[.08] bg-black/20 px-2 py-1 text-[9.5px] text-white/45">Đang dựng…</span> : null}
                {error ? <div className="max-w-[600px] rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-xs text-rose-200">{error}</div> : svg ? <div data-sr-diagram-content="1" className="h-full w-full min-h-0 min-w-0 select-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-none [&>svg]:max-w-none" dangerouslySetInnerHTML={{ __html: applyDiagramViewport(svg, panX, panY, zoom) }} /> : <div className="text-xs text-white/30">Dán mã Mermaid hoặc chọn mẫu để xem trước.</div>}
              </div>
            </div>
            <footer className="flex min-h-12 shrink-0 items-center gap-2 border-t border-white/[.07] px-3">
              {saved ? <span className="mr-auto inline-flex items-center gap-1.5 text-[10.5px] text-emerald-300"><Check size={13}/> Đã lưu Asset SVG</span> : <span className="mr-auto text-[10px] text-white/30">Asset được lưu sạch vào IndexedDB khi lưu.</span>}
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[11.5px] text-white/60 hover:bg-white/5 hover:text-white">Hủy</button>
              <button type="button" disabled={busy || !form.source.trim()} onClick={() => void onSave({ nodeSpacing, rankSpacing, viewX: panX, viewY: panY, viewZoom: zoom })} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-[11.5px] font-medium text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 disabled:opacity-40"><Save size={13}/>{busy ? 'Đang lưu…' : 'Lưu sơ đồ'}</button>
            </footer>
          </main>
        </div>
      </div>
    </div>,
    document.body,
  );
}


function MermaidSourceEditor({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLPreElement | null>(null);
  const sync = (): void => {
    if (ref.current && overlayRef.current) {
      overlayRef.current.scrollTop = ref.current.scrollTop;
      overlayRef.current.scrollLeft = ref.current.scrollLeft;
    }
  };
  return (
    <div className="relative min-h-[230px] overflow-hidden rounded-xl border border-white/[.07] bg-[var(--sr-sunk)]">
      <pre ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-white/70">{value ? <span dangerouslySetInnerHTML={{ __html: highlightMermaid(value) }} /> : null}</pre>
      <textarea
        ref={ref}
        value={value}
        spellCheck={false}
        aria-label="Mã Mermaid"
        onScroll={sync}
        onChange={(e) => onChange(e.target.value)}
        className="relative z-10 min-h-[230px] w-full resize-none overflow-auto bg-transparent p-3 font-mono text-[11px] leading-5 text-transparent caret-sky-300 outline-none selection:bg-sky-400/25"
      />
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <div><div className="mb-1 text-[10px] font-medium text-white/40">{label}</div>{children}</div>;
}
function RangeRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }): JSX.Element {
  return <label className="block text-[10px] text-white/45"><div className="mb-1 flex items-center justify-between"><span>{label}</span><span className="font-mono text-white/65">{value}</span></div><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-sky-400" /></label>;
}
