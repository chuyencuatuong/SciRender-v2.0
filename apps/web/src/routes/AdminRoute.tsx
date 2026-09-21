import { useEffect, useMemo, useState } from 'react';
import AdminDashboard, {
  type AdminDistributionItem,
  type AdminOverviewMetrics,
  type AdminUserRecord,
} from '~/components/AdminDashboard';
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { useAuth } from '~/hooks/useAuth';
import type { ProfileRow } from '~/lib/database.types';
import { navigate } from '~/lib/hash-route';
import { SUPABASE_NOT_CONFIGURED, requireSupabase } from '~/lib/supabase';
import { Notice, RouteChrome } from './RouteChrome';

/**
 * The redirect here is UX only. What actually keeps a student out is RLS:
 * `profiles_select_admin` returns other users' rows only when
 * `private.is_admin()` is true, so a student who forces this route sees
 * nothing but their own row.
 */
const PAGE = 1000; // PostgREST's default max-rows; larger cohorts need paging.

function distribution(rows: AdminUserRecord[], key: 'university' | 'faculty'): AdminDistributionItem[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = r[key]?.trim() || 'Chưa khai báo';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

/** Excel-safe CSV: UTF-8 BOM for Vietnamese, and formula-injection guard (=, +, -, @, tab, CR). */
function toCsv(rows: AdminUserRecord[]): string {
  const cell = (v: unknown): string => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Họ và tên', 'MSSV', 'Trường', 'Khoa', 'Ngành', 'Ngày tạo'];
  const body = rows.map((r) => [r.full_name, r.student_id, r.university, r.faculty, r.major, r.created_at].map(cell).join(','));
  return `﻿${[head.map(cell).join(','), ...body].join('\r\n')}`;
}

export function AdminRoute(): JSX.Element {
  const auth = useAuth();
  const { user, role, isLoading } = auth;
  const [rows, setRows] = useState<ProfileRow[] | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const allowed = auth.isConfigured && !isLoading && Boolean(user) && role === 'admin';

  useEffect(() => {
    if (!auth.isConfigured || isLoading) return;
    if (!user || role !== 'admin') navigate('dashboard', undefined, true);
  }, [auth.isConfigured, isLoading, user, role]);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void (async () => {
      const client = requireSupabase();
      const { data, error: e } = await client
        .from('profiles')
        .select('id, full_name, university, faculty, major, academic_year, student_id, birth_year, hometown, role, auto_fill_cover, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(0, PAGE - 1);
      if (!alive) return;
      if (e) setError(`Không tải được danh sách hồ sơ: ${e.message}`);
      else setRows((data ?? []) as ProfileRow[]);

      // documents RLS is owner-only (no admin policy), so a plain count would
      // only count the admin's own rows. The RPC is SECURITY DEFINER and
      // checks is_admin() itself — see supabase/migrations/…_admin_stats.sql.
      const rpc = await client.rpc('admin_document_count');
      if (!alive) return;
      if (rpc.error) {
        setDocCount(null);
        setWarn('Chưa có hàm admin_document_count (chạy migration 20260921000100_admin_stats.sql) — tổng tài liệu hiển thị 0.');
      } else setDocCount(Number(rpc.data) || 0);
    })();
    return () => {
      alive = false;
    };
  }, [allowed]);

  const users = useMemo<AdminUserRecord[]>(
    () =>
      (rows ?? []).map((r) => ({
        id: r.id,
        full_name: r.full_name ?? '',
        student_id: r.student_id ?? '',
        faculty: r.faculty ?? '',
        major: r.major ?? '',
        university: r.university ?? '',
        created_at: r.created_at,
      })),
    [rows],
  );

  const overview = useMemo<AdminOverviewMetrics>(
    () => ({
      totalStudents: (rows ?? []).filter((r) => r.role === 'student').length,
      totalDocuments: docCount ?? 0,
      universityDistribution: distribution(users, 'university'),
      facultyDistribution: distribution(users, 'faculty'),
    }),
    [rows, users, docCount],
  );

  if (!auth.isConfigured) {
    return (
      <RouteChrome>
        <Notice tone="error">{SUPABASE_NOT_CONFIGURED}</Notice>
      </RouteChrome>
    );
  }
  if (!allowed || rows === null) {
    return error ? (
      <RouteChrome back={{ href: '#dashboard', label: 'Tài khoản' }}>
        <Notice tone="error">{error}</Notice>
      </RouteChrome>
    ) : (
      <AppLoadingScreen />
    );
  }

  return (
    <RouteChrome back={{ href: '#dashboard', label: 'Tài khoản' }}>
      {warn ? <Notice onClose={() => setWarn(null)}>{warn}</Notice> : null}
      {rows.length >= PAGE ? <Notice>Đang hiển thị {PAGE} hồ sơ mới nhất — cần phân trang khi vượt ngưỡng này.</Notice> : null}
      <AdminDashboard
        role="admin"
        overview={overview}
        users={users}
        onExportExcel={(list) => {
          const blob = new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `scirender-sinh-vien-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        }}
      />
    </RouteChrome>
  );
}
