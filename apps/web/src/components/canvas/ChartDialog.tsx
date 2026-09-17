import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { descriptiveStats, evaluateGrid, linearRegression, parseNumber, quadraticRegression } from '@scirender/table-engine';
import { renderChartSvg, type ChartKind, type RegressionKind } from '@scirender/figure-engine';
import type { TableForm } from '~/lib/card-forms';

interface Props {
  form: TableForm;
  defaultLabel: string;
  onClose: () => void;
  onCreate: (svg: string, meta: { caption: string; label: string; width: string }) => void | Promise<void>;
}

export function ChartDialog({ form, defaultLabel, onClose, onCreate }: Props): JSX.Element {
  const [kind, setKind] = useState<ChartKind>('scatter');
  const [xIndex, setXIndex] = useState(0);
  const [yIndex, setYIndex] = useState(form.header.length > 1 ? 1 : 0);
  const [regressionKind, setRegressionKind] = useState<RegressionKind>('none');
  const [showGrid, setShowGrid] = useState(true);
  const [showR2, setShowR2] = useState(true);
  const [title, setTitle] = useState('');
  const [xLabel, setXLabel] = useState(form.header[0] ?? 'X');
  const [yLabel, setYLabel] = useState(form.header[yIndex] ?? 'Y');
  const [caption, setCaption] = useState(`Đồ thị ${form.header[yIndex] ?? 'Y'} theo ${form.header[xIndex] ?? 'X'}`);
  const [label, setLabel] = useState(defaultLabel);
  const [creating, setCreating] = useState(false);

  const evaluated = useMemo(() => evaluateGrid({ header: form.header, rows: form.rows }), [form]);

  const analysis = useMemo(() => {
    if (kind === 'bar') {
      const bars = form.rows
        .map((_, i) => {
          const x = evaluated.values[i]?.[xIndex] ?? '';
          const y = parseNumber(evaluated.values[i]?.[yIndex] ?? '');
          return y == null ? null : { label: x, y };
        })
        .filter((v): v is { label: string; y: number } => v !== null);
      return { bars, points: [], stats: descriptiveStats(bars.map((b) => b.y)), regression: null };
    }
    const points = form.rows
      .map((_, i) => {
        const x = parseNumber(evaluated.values[i]?.[xIndex] ?? '');
        const y = parseNumber(evaluated.values[i]?.[yIndex] ?? '');
        return x == null || y == null ? null : { x, y };
      })
      .filter((v): v is { x: number; y: number } => v !== null);
    const regression = regressionKind === 'linear'
      ? linearRegression({ x: points.map((p) => p.x), y: points.map((p) => p.y) })
      : regressionKind === 'quadratic'
        ? quadraticRegression({ x: points.map((p) => p.x), y: points.map((p) => p.y) })
        : null;
    return { points, bars: [], stats: descriptiveStats(points.map((p) => p.y)), regression };
  }, [evaluated.values, form.rows, kind, xIndex, yIndex, regressionKind]);

  const effectiveRegression = kind === 'bar' ? null : analysis.regression;
  const svg = useMemo(
    () =>
      renderChartSvg({
        kind,
        points: analysis.points,
        bars: analysis.bars,
        title,
        xLabel,
        yLabel,
        showGrid,
        showRegression: Boolean(effectiveRegression),
        regressionEquation: effectiveRegression?.equation,
        r2: showR2 ? effectiveRegression?.r2 : undefined,
        regressionPredict: effectiveRegression?.predict,
      }),
    [analysis.bars, analysis.points, effectiveRegression, kind, showGrid, showR2, title, xLabel, yLabel],
  );

  const create = async (): Promise<void> => {
    if (creating) return;
    const cleanLabel = label.trim().replace(/^#/, '');
    const cleanCaption = caption.trim() || `Đồ thị ${yLabel || 'Y'} theo ${xLabel || 'X'}`;
    setCreating(true);
    try {
      await onCreate(svg, { caption: cleanCaption, label: cleanLabel, width: '100%' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tạo biểu đồ SVG"
      className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/45 p-5"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-[var(--sr-surface)] shadow-pop">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 px-4">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Tạo đồ thị vector SVG</div>
            <div className="text-[10.5px] text-ink-400">Không dùng Chart.js/D3 — SVG thuần, giữ nét khi in PDF.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900">
            <X size={15} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="space-y-3">
            <Field label="Loại biểu đồ">
              <select value={kind} onChange={(e) => setKind(e.target.value as ChartKind)} className="control">
                <option value="scatter">Scatter Plot</option>
                <option value="line">Line Chart</option>
                <option value="bar">Bar Chart</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Trục X">
                <select
                  value={xIndex}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setXIndex(next);
                    setXLabel(form.header[next] ?? 'X');
                    setCaption(`Đồ thị ${form.header[yIndex] ?? 'Y'} theo ${form.header[next] ?? 'X'}`);
                  }}
                  className="control"
                >
                  {form.header.map((h, i) => <option key={i} value={i}>{h || `Cột ${i + 1}`}</option>)}
                </select>
              </Field>
              <Field label="Trục Y / Giá trị">
                <select
                  value={yIndex}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setYIndex(next);
                    setYLabel(form.header[next] ?? 'Y');
                    setCaption(`Đồ thị ${form.header[next] ?? 'Y'} theo ${form.header[xIndex] ?? 'X'}`);
                  }}
                  className="control"
                >
                  {form.header.map((h, i) => <option key={i} value={i}>{h || `Cột ${i + 1}`}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Hồi quy">
              <select value={regressionKind} disabled={kind === 'bar'} onChange={(e) => setRegressionKind(e.target.value as RegressionKind)} className="control">
                <option value="none">Không vẽ đường xu hướng</option>
                <option value="linear">Tuyến tính: y = ax + b</option>
                <option value="quadratic">Bậc 2: y = ax² + bx + c</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên trục X"><input className="control" value={xLabel} onChange={(e) => setXLabel(e.target.value)} /></Field>
              <Field label="Tên trục Y"><input className="control" value={yLabel} onChange={(e) => setYLabel(e.target.value)} /></Field>
            </div>
            <Field label="Tiêu đề biểu đồ"><input className="control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Không bắt buộc" /></Field>
            <Field label="Chú thích hình"><input className="control" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
            <Field label="Nhãn cross-reference"><input className="control" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>

            <div className="space-y-2 rounded-[10px] border border-ink-200 bg-ink-50/60 p-2.5 text-[11px] text-ink-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Hiện lưới</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showR2} onChange={(e) => setShowR2(e.target.checked)} disabled={!effectiveRegression} /> Hiện R²</label>
            </div>

            <div className="rounded-[10px] border border-ink-200 p-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Thống kê Y</div>
              {analysis.stats ? (
                <div className="grid grid-cols-3 gap-1.5 text-[10.5px] text-ink-600">
                  <Stat label="N" value={String(analysis.stats.n)} />
                  <Stat label="Mean" value={num(analysis.stats.mean)} />
                  <Stat label="Median" value={num(analysis.stats.median)} />
                  <Stat label="SD" value={num(analysis.stats.sd)} />
                  <Stat label="Min" value={num(analysis.stats.min)} />
                  <Stat label="Max" value={num(analysis.stats.max)} />
                </div>
              ) : <div className="text-[10.5px] text-flag-600">Chưa đủ dữ liệu số.</div>}
            </div>

            {effectiveRegression ? (
              <div className="rounded-[10px] border border-sky-200 bg-sky-50/50 p-2.5 text-[11px] text-ink-700">
                <div className="font-semibold">R² = {num(effectiveRegression.r2)}</div>
                <div className="mt-1 break-words font-mono text-[10px]">{effectiveRegression.latex}</div>
                <div className="mt-1 text-[10px] text-ink-400">Đủ {analysis.points.length} cặp số để khớp.</div>
              </div>
            ) : null}
          </section>

          <section className="min-w-0 rounded-[12px] border border-ink-200 bg-ink-50/50 p-2">
            <div className="mb-1 px-1.5 text-[10.5px] text-ink-400">Xem trước — dữ liệu đang lấy trực tiếp từ bảng hiện tại</div>
            <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-[9px] bg-white p-2">
              <div className="w-full max-w-[820px]" dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-ink-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-500 hover:bg-ink-100">Hủy</button>
          <button type="button" onClick={() => void create()} disabled={creating || !label.trim() || (kind !== 'bar' && analysis.points.length < 2) || (kind === 'bar' && analysis.bars.length === 0) || (regressionKind !== 'none' && !effectiveRegression)} className="rounded-lg bg-deep-600 px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-deep-700 disabled:cursor-not-allowed disabled:opacity-45">
            {creating ? 'Đang lưu SVG…' : 'Chèn Hình SVG vào tài liệu'}
          </button>
        </footer>
      </div>
      <style>{`.control{width:100%;border:1px solid rgb(var(--ink-200));border-radius:8px;background:var(--sr-surface);padding:6px 8px;font-size:11.5px;color:rgb(var(--ink-800));outline:none}.control:focus{border-color:rgb(var(--sky-500));box-shadow:0 0 0 2px rgb(var(--sky-500)/.10)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <label className="block"><span className="mb-1 block text-[10.5px] font-medium text-ink-500">{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="rounded-md bg-ink-50 px-1.5 py-1"><div className="text-[9px] uppercase text-ink-400">{label}</div><div className="font-medium text-ink-700">{value}</div></div>;
}

function num(v: number): string { return Number(v.toFixed(6)).toString(); }

