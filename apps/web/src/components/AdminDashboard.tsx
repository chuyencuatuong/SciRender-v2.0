import {
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

export type AdminRole = 'admin' | 'student';

export interface AdminUserRecord {
  id: string;
  full_name: string;
  student_id: string;
  faculty: string;
  major: string;
  university: string;
  created_at: string | Date;
}

export interface AdminDistributionItem {
  label: string;
  count: number;
  percentage?: number;
}

export interface AdminOverviewMetrics {
  totalStudents: number;
  totalDocuments: number;
  universityDistribution: AdminDistributionItem[];
  facultyDistribution: AdminDistributionItem[];
}

export interface AdminDashboardProps {
  role: AdminRole;
  overview: AdminOverviewMetrics;
  users: AdminUserRecord[];
  onExportExcel: (users: AdminUserRecord[]) => Promise<void> | void;
}

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Không xác định';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(value)));
}

function DistributionCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Users;
  items: AdminDistributionItem[];
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">Phân bố theo dữ liệu hồ sơ hiện tại.</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu phân bố.</p>
        ) : (
          items.slice(0, 6).map((item) => {
            const maxCount = Math.max(...items.map((entry) => entry.count), 1);
            const percentage = item.percentage ?? (item.count / maxCount) * 100;
            return (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                  <span className="truncate font-medium text-slate-300">{item.label}</span>
                  <span className="shrink-0 font-mono text-slate-500">{formatInteger(item.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0052cc] to-[#38bdf8]"
                    style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

export default function AdminDashboard({
  role,
  overview,
  users,
  onExportExcel,
}: AdminDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  const facultyOptions = useMemo(() => {
    const values = new Set(users.map((user) => user.faculty.trim()).filter(Boolean));
    return Array.from(values).sort((first, second) => first.localeCompare(second, 'vi'));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi');

    return users.filter((user) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        user.full_name.toLocaleLowerCase('vi').includes(normalizedSearch) ||
        user.student_id.toLocaleLowerCase('vi').includes(normalizedSearch);

      const matchesFaculty = facultyFilter === 'all' || user.faculty === facultyFilter;

      return matchesSearch && matchesFaculty;
    });
  }, [facultyFilter, searchTerm, users]);

  if (role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#070b14] font-ui text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6 py-12">
          <section className="w-full rounded-2xl border border-rose-500/20 bg-[#0d1424] p-8 text-center shadow-2xl shadow-black/30">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-300">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-5 text-xl font-semibold text-slate-100">Không có quyền truy cập</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Khu vực quản trị chỉ dành cho tài khoản có vai trò quản trị viên trong hồ sơ Supabase.
            </p>
          </section>
        </div>
      </div>
    );
  }

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await onExportExcel(filteredUsers);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] font-ui text-slate-100">
      <div className="mx-auto max-w-[1600px] p-5 sm:p-7 xl:p-10">
        <header className="rounded-3xl border border-slate-800 bg-[#0d1424] p-6 shadow-xl shadow-black/15 sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Khu vực Quản trị viên
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Điều hành SciRender</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Theo dõi người dùng, tài liệu và phân bố hồ sơ học thuật trong toàn hệ thống. Các dữ liệu hiển thị phụ thuộc quyền RLS của tài khoản quản trị viên.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0052cc] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0052cc]/20 transition hover:bg-[#0b61dc] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? <FileSpreadsheet className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
              Xuất dữ liệu Excel (.xlsx)
            </button>
          </div>
        </header>

        <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Thống kê tổng quan">
          <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
                <Users className="h-5 w-5" />
              </span>
              <span className="rounded-lg border border-slate-800 bg-[#070b14] px-2.5 py-1 text-[11px] font-semibold text-slate-500">STUDENTS</span>
            </div>
            <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-100">{formatInteger(overview.totalStudents)}</div>
            <div className="mt-1 text-sm text-slate-400">Tổng số sinh viên đăng ký</div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <span className="rounded-lg border border-slate-800 bg-[#070b14] px-2.5 py-1 text-[11px] font-semibold text-slate-500">DOCUMENTS</span>
            </div>
            <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-100">{formatInteger(overview.totalDocuments)}</div>
            <div className="mt-1 text-sm text-slate-400">Tổng số tài liệu toàn hệ thống</div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-[#0d1424] p-6 md:col-span-2 xl:col-span-1">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/10 text-sky-300">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="rounded-lg border border-slate-800 bg-[#070b14] px-2.5 py-1 text-[11px] font-semibold text-slate-500">PROFILE</span>
            </div>
            <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-100">{facultyOptions.length}</div>
            <div className="mt-1 text-sm text-slate-400">Khoa / Viện đang có dữ liệu</div>
          </article>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-2">
          <DistributionCard title="Phân bố theo Trường" icon={GraduationCap} items={overview.universityDistribution} />
          <DistributionCard title="Phân bố theo Khoa / Viện" icon={Users} items={overview.facultyDistribution} />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424]">
          <div className="border-b border-slate-800 p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">User Directory</h2>
                <p className="mt-1 text-sm text-slate-500">Danh sách hồ sơ được phép truy cập bởi tài khoản quản trị viên.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative min-w-0 sm:w-72">
                  <span className="sr-only">Tìm kiếm theo tên hoặc MSSV</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-[#070b14] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/10"
                    aria-label="Tìm kiếm theo tên hoặc MSSV"
                  />
                </label>

                <label className="relative sm:w-56">
                  <span className="sr-only">Lọc theo Khoa / Viện</span>
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <select
                    value={facultyFilter}
                    onChange={(event) => setFacultyFilter(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-800 bg-[#070b14] py-2.5 pl-10 pr-8 text-sm text-slate-100 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/10"
                    aria-label="Lọc theo Khoa / Viện"
                  >
                    <option value="all">Tất cả Khoa / Viện</option>
                    {facultyOptions.map((faculty) => (
                      <option key={faculty} value={faculty}>
                        {faculty}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-800 px-5 py-3 sm:px-6">
            <div className="text-xs font-medium text-slate-500">
              Hiển thị <span className="font-mono text-slate-300">{formatInteger(filteredUsers.length)}</span> / {formatInteger(users.length)} hồ sơ
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead className="bg-[#070b14]">
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-5 py-4 font-semibold sm:px-6">Họ tên</th>
                  <th className="px-5 py-4 font-semibold">MSSV</th>
                  <th className="px-5 py-4 font-semibold">Khoa / Ngành</th>
                  <th className="px-5 py-4 font-semibold">Trường</th>
                  <th className="px-5 py-4 font-semibold">Ngày đăng ký</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center text-sm text-slate-500">
                      Không có hồ sơ phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-800/80 transition hover:bg-slate-900/60">
                      <td className="px-5 py-4 sm:px-6">
                        <div className="font-medium text-slate-200">{user.full_name || 'Chưa cập nhật'}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-400">{user.student_id || '—'}</td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-slate-300">{user.faculty || 'Chưa cập nhật'}</div>
                        <div className="mt-1 text-xs text-slate-500">{user.major || 'Chưa cập nhật'}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300">{user.university || 'Chưa cập nhật'}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">{formatDate(user.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
