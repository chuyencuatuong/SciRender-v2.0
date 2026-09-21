import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteDocument, listDocuments, type StoredDocument } from '@scirender/storage';
import { readCounters } from '@scirender/telemetry';
import AuthModal, { type AuthMode } from '~/components/AuthModal';
import ProfileSetupModal, { type AcademicProfile } from '~/components/ProfileSetupModal';
import UserPortal, {
  type UserPortalDocument,
  type UserPortalMetrics,
  type UserPortalProfileSummary,
} from '~/components/UserPortal';
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { useAuth } from '~/hooks/useAuth';
import { navigate } from '~/lib/hash-route';
import { SUPABASE_NOT_CONFIGURED } from '~/lib/supabase';
import { Notice, RouteChrome } from './RouteChrome';

/** `$$…$$` blocks plus inline `$…$` (not `\$`, not across lines). An estimate, labelled as such. */
function countEquations(source: string): number {
  const display = source.match(/\$\$[\s\S]+?\$\$/g)?.length ?? 0;
  const inline = source.replace(/\$\$[\s\S]+?\$\$/g, '').match(/(?<![\\$])\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g)?.length ?? 0;
  return display + inline;
}

function toSummary(p: ReturnType<typeof useAuth>['profile']): UserPortalProfileSummary {
  return {
    full_name: p?.full_name ?? '',
    university: p?.university ?? 'Đại học Bách Khoa - ĐHQG-HCM',
    faculty: p?.faculty ?? '',
    major: p?.major ?? '',
    academic_year: p?.academic_year ?? '',
    student_id: p?.student_id ?? '',
    birth_year: p?.birth_year ?? null,
    hometown: p?.hometown ?? '',
    auto_fill_cover: p?.auto_fill_cover ?? true,
  };
}

export function DashboardRoute(): JSX.Element {
  const auth = useAuth();
  const { user, profile, isLoading } = auth;

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode] = useState<AuthMode>('login');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const promptedForProfile = useRef<string | null>(null);

  // Signed out → the AuthModal opens by itself (spec: /#dashboard requires login).
  useEffect(() => {
    if (auth.isConfigured && !isLoading && !user) setAuthOpen(true);
    if (user) setAuthOpen(false);
  }, [auth.isConfigured, isLoading, user]);

  // First sign-in: the trigger created an empty profile — ask for it once.
  useEffect(() => {
    if (!user || !profile || profile.full_name?.trim()) return;
    if (promptedForProfile.current === user.id) return;
    promptedForProfile.current = user.id;
    setProfileOpen(true);
  }, [user, profile]);

  const reloadDocs = useCallback(async () => {
    try {
      const list = await listDocuments();
      setDocs([...list].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (err) {
      setNotice({ tone: 'error', text: `Không đọc được tài liệu trên máy này: ${(err as Error).message}` });
    }
    try {
      const estimate = await navigator.storage?.estimate?.();
      setStorageUsed(estimate?.usage ?? 0);
    } catch {
      setStorageUsed(0);
    }
  }, []);

  useEffect(() => {
    if (user) void reloadDocs();
  }, [user, reloadDocs]);

  const documents = useMemo<UserPortalDocument[]>(
    () => docs.map((d) => ({ id: d.id, title: d.title, updatedAt: new Date(d.updatedAt), createdAt: new Date(d.createdAt) })),
    [docs],
  );

  const metrics = useMemo<UserPortalMetrics>(() => {
    let counters = { exports: 0 };
    try {
      counters = readCounters();
    } catch {
      /* counters disabled or storage blocked — show 0, not a crash */
    }
    return {
      totalDocuments: docs.length,
      exportedPdfPages: counters.exports,
      equationCount: docs.reduce((n, d) => n + countEquations(d.source), 0),
      storageUsedBytes: storageUsed,
    };
  }, [docs, storageUsed]);

  // Stable object: ProfileSetupModal resets its form whenever this identity changes.
  const initialProfile = useMemo<Partial<AcademicProfile>>(() => toSummary(profile), [profile]);

  if (!auth.isConfigured) {
    return (
      <RouteChrome>
        <Notice tone="error">{SUPABASE_NOT_CONFIGURED}</Notice>
      </RouteChrome>
    );
  }

  if (isLoading) return <AppLoadingScreen />;

  const signOut = async (): Promise<void> => {
    try {
      await auth.signOut();
      setNotice(null);
      setDocs([]);
    } catch (err) {
      setNotice({ tone: 'error', text: (err as Error).message });
    }
  };

  const authModal = (
    <AuthModal
      open={authOpen}
      initialMode={authMode}
      onClose={() => setAuthOpen(false)}
      onGoogleSignIn={auth.signInWithGoogle}
      onEmailSubmit={async ({ email, password, mode }) => {
        if (mode === 'login') {
          await auth.signInWithEmail(email, password);
          return;
        }
        const { signedIn } = await auth.signUpWithEmail(email, password);
        if (!signedIn) {
          setAuthOpen(false);
          setNotice({
            tone: 'info',
            text: `Đã gửi email xác nhận tới ${email}. Bấm liên kết trong thư rồi quay lại đây để đăng nhập.`,
          });
        }
      }}
      onGuestMode={() => navigate('app')}
    />
  );

  if (!user) {
    return (
      <RouteChrome>
        {notice ? <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice> : null}
        <div className="mx-auto mt-16 max-w-md px-6 text-center">
          <h1 className="text-xl font-semibold text-slate-100">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Đăng nhập để lưu hồ sơ học thuật và tự điền trang bìa BTL. Trình soạn thảo vẫn dùng được không cần tài khoản.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="mt-6 rounded-xl bg-[#0052cc] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0b61dc]"
          >
            Đăng nhập / Đăng ký
          </button>
        </div>
        {authModal}
      </RouteChrome>
    );
  }

  const userName =
    profile?.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email ||
    'Sinh viên';

  return (
    <RouteChrome showAdmin={auth.role === 'admin'} onSignOut={() => void signOut()}>
      {auth.profileError ? <Notice tone="error">{auth.profileError}</Notice> : null}
      {notice ? <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice> : null}
      <UserPortal
        storageMode="local"
        userName={userName}
        email={user.email ?? ''}
        documents={documents}
        profile={toSummary(profile)}
        metrics={metrics}
        onOpenDocument={(id) => navigate('app', { doc: id })}
        onDownloadPdf={(id) => navigate('app', { doc: id, action: 'print' })}
        onDownloadWord={() =>
          setNotice({
            tone: 'info',
            text: 'Xuất Word (.docx) chưa có trong SciRender. Hiện có: In / Lưu PDF, tệp HTML độc lập và Bundle sao lưu (trong trình soạn thảo).',
          })
        }
        onDeleteDocument={async (id) => {
          const doc = docs.find((d) => d.id === id);
          if (!window.confirm(`Xoá vĩnh viễn "${doc?.title ?? id}" khỏi máy này? Không hoàn tác được.`)) return;
          try {
            await deleteDocument(id);
            await reloadDocs();
            setNotice({ tone: 'info', text: `Đã xoá "${doc?.title ?? id}".` });
          } catch (err) {
            setNotice({ tone: 'error', text: `Xoá thất bại: ${(err as Error).message}` });
          }
        }}
        onEditProfile={() => setProfileOpen(true)}
      />
      <ProfileSetupModal
        open={profileOpen}
        initialProfile={initialProfile}
        onClose={() => setProfileOpen(false)}
        onSave={async (p) => {
          await auth.updateProfile(p);
          setProfileOpen(false);
          setNotice({
            tone: 'info',
            text: p.auto_fill_cover
              ? 'Đã lưu hồ sơ. Tài liệu BTL mới (và các ô bìa còn trống) sẽ được tự điền.'
              : 'Đã lưu hồ sơ. Tự điền trang bìa đang tắt.',
          });
        }}
      />
    </RouteChrome>
  );
}
