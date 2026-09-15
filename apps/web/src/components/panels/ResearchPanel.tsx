import { useState } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { clearEvents, exportEvents, getEvents } from '@scirender/telemetry';
import { useStore } from '~/state/store';

export function ResearchPanel(): JSX.Element {
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const [tick, setTick] = useState(0);
  const events = prefs.telemetryOptIn ? getEvents() : [];
  void tick;

  return (
    <>
      <div className="sr-panel-title">Dữ liệu nghiên cứu</div>

      <div className="sr-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="rounded-md border border-ink-200 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="text-[12px] leading-snug text-ink-600">
              Tầng thu thập dữ liệu tách rời hoàn toàn khỏi luồng biên dịch tài liệu.{' '}
              <strong className="text-ink-800">Mặc định tắt.</strong> Khi bật, dữ liệu chỉ nằm trong
              trình duyệt này và không được gửi đi đâu cả — muốn dùng thì bạn tự bấm xuất tệp.
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded border border-ink-200 px-2 py-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-deep-600"
              checked={prefs.telemetryOptIn}
              onChange={(e) => {
                setPref('telemetryOptIn', e.target.checked);
                setTick((t) => t + 1);
              }}
            />
            <span className="text-[12.5px] font-medium text-ink-700">
              Cho phép ghi nhận số liệu sử dụng
            </span>
          </label>
        </div>

        <div className="mt-3 rounded-md border border-ink-200 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Những gì được ghi
          </div>
          <ul className="list-disc space-y-1 pl-4 text-[11.5px] leading-snug text-ink-500">
            <li>Thời gian biên dịch, số trang, số khối</li>
            <li>Số lỗi / cảnh báo theo loại mã (không kèm nội dung)</li>
            <li>Điểm Document Health, số từ</li>
            <li>Thao tác giao diện: mở panel, đổi template, xuất tệp</li>
          </ul>
          <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Những gì không bao giờ được ghi
          </div>
          <ul className="list-disc space-y-1 pl-4 text-[11.5px] leading-snug text-ink-500">
            <li>Nội dung tài liệu, tiêu đề, tên tác giả, email</li>
            <li>Tên tệp, đường dẫn, URL</li>
            <li>Bất kỳ định danh cá nhân nào</li>
          </ul>
        </div>

        {prefs.telemetryOptIn ? (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] text-ink-500">{events.length} sự kiện trong phiên</span>
              <div className="flex gap-1.5">
                <button
                  className="sr-btn"
                  onClick={() => {
                    const blob = new Blob([exportEvents()], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'scirender-research.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  }}
                >
                  <Download size={13} /> Xuất
                </button>
                <button
                  className="sr-btn"
                  onClick={() => {
                    clearEvents();
                    setTick((t) => t + 1);
                  }}
                >
                  <Trash2 size={13} /> Xóa
                </button>
              </div>
            </div>
            <div className="sr-scroll max-h-64 overflow-y-auto rounded border border-ink-200 bg-ink-50 p-2 font-mono text-[10.5px] leading-relaxed text-ink-600">
              {events.length === 0
                ? 'Chưa có sự kiện nào.'
                : events
                    .slice(-60)
                    .reverse()
                    .map((e) => (
                      <div key={e.seq} className="truncate">
                        <span className="text-ink-400">{e.tMs}ms</span> {e.name}{' '}
                        {JSON.stringify(e.data)}
                      </div>
                    ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
