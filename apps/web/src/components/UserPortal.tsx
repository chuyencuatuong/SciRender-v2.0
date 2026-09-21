import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Download,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export type UserPortalTab = 'documents' | 'profile' | 'stats';

export interface UserPortalDocument {
  id: string;
  title: string;
  updatedAt: string | Date;
  createdAt?: string | Date;
  pageCount?: number;
}

export interface UserPortalProfileSummary {
  full_name: string;
  university: string;
  faculty: string;
  major: string;
  academic_year: string;
  student_id: string;
  birth_year: number | null;
  hometown: string;
  auto_fill_cover: boolean;
}

export interface UserPortalMetrics {
  totalDocuments: number;
  exportedPdfPages: number;
  equationCount: number;
  storageUsedBytes: number;
}

export interface UserPortalProps {
  userName: string;
  email: string;
  documents: UserPortalDocument[];
  profile: UserPortalProfileSummary;
  metrics: UserPortalMetrics;
  initialTab?: UserPortalTab;
  onOpenDocument: (documentId: string) => void;
  onDownloadPdf: (documentId: string) => Promise<void> | void;
  onDownloadWord: (documentId: string) => Promise<void> | void;
  onDeleteDocument: (documentId: string) => Promise<void> | void;
  onEditProfile: () => void;
  /**
   * DAY-1 integration: where `documents` actually live. Cloud sync to the
   * Supabase `documents` table is not wired yet, so the route passes 'local'
   * and the copy says "on this device" instead of promising a cloud that
   * does not hold the files. Defaults to 'cloud' (the original design).
   */
  storageMode?: 'cloud' | 'local';
}

const COPY = {
  cloud: {
    emptyTitle: 'Chưa có tài liệu lưu trên đám mây',
    emptyBody: 'Khi bạn lưu tài liệu bằng tài khoản SciRender, các bản chỉnh sửa sẽ xuất hiện tại đây.',
    asideTitle: 'Cloud Workspace',
    asideBody: 'Tài liệu cá nhân và metadata học thuật được quản lý tập trung qua tài khoản của bạn.',
    countLabel: 'Tài liệu trên cloud',
    listCaption: 'Các bản thảo được lưu bằng tài khoản hiện tại.',
    syncBadge: 'Đồng bộ cloud',
    exportLabel: 'Số trang PDF đã xuất',
    exportCaption: 'Tổng số trang từ các lần xuất PDF được ghi nhận.',
    storageLabel: 'Dung lượng lưu trữ đám mây',
    storageCaption: 'Dung lượng cloud đang sử dụng bởi tài khoản của bạn.',
  },
  local: {
    emptyTitle: 'Chưa có tài liệu trên máy này',
    emptyBody: 'Mở trình soạn thảo để tạo tài liệu đầu tiên. Tài liệu được lưu trong trình duyệt của máy này.',
    asideTitle: 'Lưu trên máy này',
    asideBody: 'Tài liệu nằm trong IndexedDB của trình duyệt này. Hồ sơ học thuật được lưu theo tài khoản. Đồng bộ đám mây sẽ có ở giai đoạn sau.',
    countLabel: 'Tài liệu trên máy này',
    listCaption: 'Các bản thảo lưu cục bộ trong trình duyệt này (chưa đồng bộ đám mây).',
    syncBadge: 'Cục bộ',
    exportLabel: 'Số lần in / xuất PDF',
    exportCaption: 'Bộ đếm cục bộ của trình duyệt này (panel "Dữ liệu nghiên cứu").',
    storageLabel: 'Dung lượng dùng trên máy',
    storageCaption: 'Ước tính của trình duyệt cho dữ liệu SciRender (IndexedDB + bộ nhớ đệm).',
  },
} as const;

const tabs: Array<{ id: UserPortalTab; label: string; icon: typeof FileText }> = [
  { id: 'documents', label: 'Tài liệu của tôi', icon: FileText },
  { id: 'profile', label: 'Hồ sơ học thuật', icon: CircleUserRound },
  { id: 'stats', label: 'Thống kê cá nhân', icon: BarChart3 },
];

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Không xác định';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(value)));
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'SR';
  }

  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof FileText;
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-5 shadow-lg shadow-black/10">
      <div className="mb-5 flex items-start justify-between gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
          <Icon className="h-5 w-5" />
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.6)]" />
      </div>
      <p className="text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{caption}</p>
    </article>
  );
}

function DocumentCard({
  document,
  busyAction,
  onOpen,
  onDownloadPdf,
  onDownloadWord,
  onDelete,
}: {
  document: UserPortalDocument;
  busyAction: string | null;
  onOpen: () => void;
  onDownloadPdf: () => void;
  onDownloadWord: () => void;
  onDelete: () => void;
}) {
  const isBusy = busyAction !== null;

  return (
    <article className="group flex min-h-[250px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424] transition hover:border-slate-700 hover:shadow-xl hover:shadow-black/20">
      <div className="relative flex min-h-[128px] flex-1 items-center justify-center overflow-hidden bg-[#070b14] p-6">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent opacity-0 transition group-hover:opacity-100" />
        <div className="relative w-full max-w-[190px] rounded-lg border border-slate-800 bg-[#0d1424] px-5 py-6 shadow-2xl shadow-black/30">
          <div className="mb-4 h-1.5 w-16 rounded-full bg-slate-700" />
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-slate-800" />
            <div className="h-1.5 w-4/5 rounded-full bg-slate-800" />
            <div className="h-1.5 w-3/5 rounded-full bg-sky-500/20" />
            <div className="mt-5 h-12 rounded-md border border-slate-800 bg-slate-900/50" />
          </div>
        </div>
        {document.pageCount != null ? (
          <span className="absolute bottom-3 right-3 rounded-md border border-slate-800 bg-[#0d1424]/90 px-2 py-1 text-[11px] font-medium text-slate-400 backdrop-blur">
            {formatInteger(document.pageCount)} trang
          </span>
        ) : null}
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-100">{document.title}</h3>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Sửa {formatDate(document.updatedAt)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onOpen}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0052cc] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0b61dc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PencilLine className="h-3.5 w-3.5" />
            Mở trong Editor
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onDownloadPdf}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === `${document.id}:pdf` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onDownloadWord}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === `${document.id}:word` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Word
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onDelete}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:border-rose-500/30 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === `${document.id}:delete` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Xóa tài liệu
          </button>
        </div>
      </div>
    </article>
  );
}

export default function UserPortal({
  userName,
  email,
  documents,
  profile,
  metrics,
  initialTab = 'documents',
  onOpenDocument,
  onDownloadPdf,
  onDownloadWord,
  onDeleteDocument,
  onEditProfile,
  storageMode = 'cloud',
}: UserPortalProps) {
  const copy = COPY[storageMode];
  const [activeTab, setActiveTab] = useState<UserPortalTab>(initialTab);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const documentCountLabel = useMemo(() => formatInteger(metrics.totalDocuments), [metrics.totalDocuments]);

  const executeDocumentAction = async (
    actionId: string,
    action: () => Promise<void> | void,
  ) => {
    setBusyAction(actionId);
    try {
      await action();
    } finally {
      setBusyAction(null);
    }
  };

  const renderDocuments = () => {
    if (documents.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0d1424]/60 px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
            <FileText className="h-6 w-6" />
          </span>
          <h3 className="mt-5 text-base font-semibold text-slate-100">{copy.emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {copy.emptyBody}
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((document) => (
          <DocumentCard
            key={document.id}
            document={document}
            busyAction={busyAction}
            onOpen={() => onOpenDocument(document.id)}
            onDownloadPdf={() => executeDocumentAction(`${document.id}:pdf`, () => onDownloadPdf(document.id))}
            onDownloadWord={() => executeDocumentAction(`${document.id}:word`, () => onDownloadWord(document.id))}
            onDelete={() => executeDocumentAction(`${document.id}:delete`, () => onDeleteDocument(document.id))}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070b14] font-ui text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-slate-800 bg-[#0d1424] lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col p-4 sm:p-5">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0052cc] text-sm font-bold text-white shadow-lg shadow-[#0052cc]/25">
                SR
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight text-slate-100">SciRender</div>
                <div className="text-xs text-slate-500">Engineering Report Workspace</div>
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-slate-800 bg-[#070b14] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-xs font-bold text-sky-300">
                  {initials(userName)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{userName}</div>
                  <div className="truncate text-xs text-slate-500">{email}</div>
                </div>
              </div>
            </div>

            <nav className="mt-5 grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1" aria-label="Khu vực cá nhân">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                      active
                        ? 'bg-[#0052cc] text-white shadow-lg shadow-[#0052cc]/15'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </span>
                    <ChevronRight className={`h-4 w-4 transition ${active ? 'translate-x-0.5 opacity-100' : 'opacity-0 group-hover:opacity-70'}`} />
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto hidden rounded-2xl border border-slate-800 bg-[#070b14] p-4 lg:block">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                <LayoutDashboard className="h-3.5 w-3.5 text-sky-400" />
                {copy.asideTitle}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {copy.asideBody}
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-5 sm:p-7 xl:p-10">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                <GraduationCap className="h-3.5 w-3.5" />
                Personal Workspace
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Xin chào, {userName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Quản lý tài liệu, hồ sơ học thuật và hoạt động sử dụng SciRender trong một không gian thống nhất.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#0d1424] px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{copy.countLabel}</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{documentCountLabel}</div>
            </div>
          </header>

          {activeTab === 'documents' ? (
            <section aria-labelledby="documents-heading">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 id="documents-heading" className="text-lg font-semibold text-slate-100">Tài liệu của tôi</h2>
                  <p className="mt-1 text-sm text-slate-500">{copy.listCaption}</p>
                </div>
                <span className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-[#0d1424] px-3 py-2 text-xs text-slate-400 sm:inline-flex">
                  <Cloud className="h-3.5 w-3.5 text-sky-400" />
                  {copy.syncBadge}
                </span>
              </div>
              {renderDocuments()}
            </section>
          ) : null}

          {activeTab === 'profile' ? (
            <section aria-labelledby="profile-heading" className="max-w-4xl">
              <div className="mb-5">
                <h2 id="profile-heading" className="text-lg font-semibold text-slate-100">Hồ sơ học thuật</h2>
                <p className="mt-1 text-sm text-slate-500">Thông tin được dùng để tự động hoàn thiện metadata và Trang Bìa.</p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424]">
                <div className="border-b border-slate-800 bg-[#070b14]/60 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                        <GraduationCap className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-slate-100">{profile.full_name || 'Chưa cập nhật họ tên'}</div>
                        <div className="mt-1 text-sm text-slate-500">{profile.university || 'Chưa cập nhật trường đại học'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onEditProfile}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-500/30 hover:bg-slate-900"
                    >
                      <PencilLine className="h-4 w-4" />
                      Chỉnh sửa hồ sơ
                    </button>
                  </div>
                </div>

                <dl className="grid gap-px bg-slate-800 sm:grid-cols-2">
                  {[
                    ['Khoa / Viện', profile.faculty || 'Chưa cập nhật'],
                    ['Ngành học', profile.major || 'Chưa cập nhật'],
                    ['Khóa / Niên khóa', profile.academic_year || 'Chưa cập nhật'],
                    ['MSSV', profile.student_id || 'Chưa cập nhật'],
                    ['Năm sinh', profile.birth_year == null ? 'Chưa cập nhật' : String(profile.birth_year)],
                    ['Quê quán', profile.hometown || 'Chưa cập nhật'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-[#0d1424] px-6 py-5">
                      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
                      <dd className="mt-2 text-sm font-medium text-slate-200">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-start gap-3 border-t border-slate-800 px-6 py-5">
                  <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${profile.auto_fill_cover ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.6)]' : 'bg-slate-700'}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Tự động điền Trang Bìa</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {profile.auto_fill_cover
                        ? 'Đang bật — hồ sơ sẽ được dùng khi tạo tài liệu mới.'
                        : 'Đang tắt — SciRender sẽ không tự điền hồ sơ vào tài liệu mới.'}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'stats' ? (
            <section aria-labelledby="stats-heading">
              <div className="mb-5">
                <h2 id="stats-heading" className="text-lg font-semibold text-slate-100">Thống kê cá nhân</h2>
                <p className="mt-1 text-sm text-slate-500">Các số liệu tổng hợp từ workspace của tài khoản hiện tại.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Tổng số tài liệu"
                  value={formatInteger(metrics.totalDocuments)}
                  caption="Tài liệu đang được lưu trong workspace của bạn."
                  icon={FileText}
                />
                <MetricCard
                  label={copy.exportLabel}
                  value={formatInteger(metrics.exportedPdfPages)}
                  caption={copy.exportCaption}
                  icon={BookOpenText}
                />
                <MetricCard
                  label="Số công thức toán đã dùng"
                  value={formatInteger(metrics.equationCount)}
                  caption="Số công thức được lưu trong tài liệu và dữ liệu workspace."
                  icon={BarChart3}
                />
                <MetricCard
                  label={copy.storageLabel}
                  value={formatBytes(metrics.storageUsedBytes)}
                  caption={copy.storageCaption}
                  icon={Cloud}
                />
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
                <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Nhịp độ sử dụng</h3>
                      <p className="mt-1 text-xs text-slate-500">Khu vực sẵn sàng nhận thêm dữ liệu telemetry từ backend.</p>
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-7 gap-2">
                    {Array.from({ length: 28 }, (_, index) => (
                      <span
                        key={index}
                        className={`aspect-square rounded-md border ${
                          index % 7 === 0 || index % 9 === 0
                            ? 'border-sky-500/20 bg-sky-500/20'
                            : index % 5 === 0
                              ? 'border-slate-700 bg-slate-800'
                              : 'border-slate-800 bg-[#070b14]'
                        }`}
                        title={`Ngày hoạt động ${index + 1}`}
                      />
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
                      <GraduationCap className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Academic Identity</h3>
                      <p className="mt-1 text-xs text-slate-500">Metadata hiện tại của tài khoản.</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Trường</div>
                      <div className="mt-1 text-sm text-slate-200">{profile.university || 'Chưa cập nhật'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ngành</div>
                      <div className="mt-1 text-sm text-slate-200">{profile.major || 'Chưa cập nhật'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">MSSV</div>
                      <div className="mt-1 font-mono text-sm text-slate-200">{profile.student_id || 'Chưa cập nhật'}</div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
