import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  PROFILE_WRITABLE_COLUMNS,
  type ProfileRole,
  type ProfileRow,
  type ProfileUpdate,
} from '~/lib/database.types';
import { authRedirectUrl, isSupabaseConfigured, requireSupabase, supabase } from '~/lib/supabase';

export interface SignUpResult {
  /** false → Supabase requires e-mail confirmation before a session exists. */
  signedIn: boolean;
}

export interface AuthState {
  /** false when apps/web/.env has no Supabase keys — the app runs guest-only. */
  isConfigured: boolean;
  user: User | null;
  session: Session | null;
  profile: ProfileRow | null;
  role: ProfileRole | null;
  /** true until the first session check (and its profile fetch) settles. */
  isLoading: boolean;
  /** Last profile-load error, shown by the caller (P6), never swallowed. */
  profileError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<ProfileRow>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Supabase's English errors → the Vietnamese the rest of the UI speaks. */
function friendly(error: { message?: string } | null | undefined, fallback: string): Error {
  const raw = (error?.message ?? '').trim();
  const table: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
    [/email not confirmed/i, 'Email chưa được xác nhận. Hãy mở hộp thư và bấm vào liên kết xác nhận.'],
    [/user already registered/i, 'Email này đã có tài khoản. Hãy chuyển sang Đăng nhập.'],
    [/password should be at least/i, 'Mật khẩu quá ngắn (tối thiểu 6 ký tự).'],
    [/rate limit|too many requests/i, 'Thao tác quá nhanh. Đợi một lát rồi thử lại.'],
    [/provider is not enabled|unsupported provider/i, 'Đăng nhập Google chưa được bật trong Supabase (Authentication → Providers).'],
    [/failed to fetch|networkerror/i, 'Không kết nối được máy chủ tài khoản. Kiểm tra mạng hoặc VITE_SUPABASE_URL.'],
  ];
  for (const [re, vi] of table) if (re.test(raw)) return new Error(vi);
  return new Error(raw || fallback);
}

/** Removes `?code=…` left by the PKCE redirect so a reload does not replay it. */
function cleanAuthParams(): void {
  const url = new URL(window.location.href);
  let touched = false;
  for (const key of ['code', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      touched = true;
    }
  }
  if (touched) window.history.replaceState(window.history.state, '', url.toString());
}

function pickWritable(patch: ProfileUpdate): ProfileUpdate {
  const out: Record<string, unknown> = {};
  for (const key of PROFILE_WRITABLE_COLUMNS) {
    if (key in patch) out[key] = (patch as Record<string, unknown>)[key];
  }
  return out as ProfileUpdate;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Every fetch gets a ticket; a slower, older response (e.g. from before a
  // sign-out) must not overwrite the current user's profile.
  const ticket = useRef(0);
  /** User id whose profile is currently loaded (null = signed out). */
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null): Promise<void> => {
    const mine = ++ticket.current;
    if (!userId || !supabase) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    let row: ProfileRow | null = null;
    let lastError: string | null = null;
    // The row is created by the `on_auth_user_created` trigger in the same
    // transaction as the user, so one retry covers replica lag, not a race.
    for (let attempt = 0; attempt < 2 && !row; attempt++) {
      if (attempt > 0) await new Promise((r) => window.setTimeout(r, 700));
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle<ProfileRow>();
      if (error) lastError = friendly(error, 'Không tải được hồ sơ.').message;
      else row = data;
    }
    if (mine !== ticket.current) return;
    setProfile(row);
    setProfileError(row ? null : lastError ?? 'Chưa có hồ sơ cho tài khoản này (trigger handle_new_user chưa chạy?).');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let alive = true;

    // INITIAL_SESSION fires once on subscribe, so no separate getSession().
    const { data } = client.auth.onAuthStateChange((event: AuthChangeEvent, next: Session | null) => {
      if (!alive) return;
      setSession(next);
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') cleanAuthParams();
      const uid = next?.user.id ?? null;
      // Supabase re-emits SIGNED_IN when a tab regains focus and emits
      // TOKEN_REFRESHED hourly; neither changes whose profile this is.
      if (event !== 'INITIAL_SESSION' && event !== 'USER_UPDATED' && uid === loadedFor.current) return;
      // Until the profile of the *new* user is in, `role` is unknown — guards
      // (e.g. /#admin) must wait instead of redirecting on a transient null.
      setIsLoading(true);
      // Supabase documents a deadlock when another supabase call is awaited
      // inside this callback — defer the profile query to the next task.
      window.setTimeout(() => {
        if (!alive) return;
        void loadProfile(uid).finally(() => {
          if (!alive) return;
          loadedFor.current = uid;
          setIsLoading(false);
        });
      }, 0);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) throw friendly(error, 'Không mở được đăng nhập Google.');
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw friendly(error, 'Đăng nhập thất bại.');
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) throw friendly(error, 'Đăng ký thất bại.');
    return { signedIn: Boolean(data.session) };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw friendly(error, 'Đăng xuất thất bại.');
    ticket.current++;
    setProfile(null);
  }, []);

  const userId = session?.user.id ?? null;

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!userId) throw new Error('Bạn cần đăng nhập để lưu hồ sơ.');
      const { data, error } = await requireSupabase()
        .from('profiles')
        .update(pickWritable(patch))
        .eq('id', userId)
        .select('*')
        .single<ProfileRow>();
      if (error) throw friendly(error, 'Không lưu được hồ sơ.');
      ticket.current++;
      setProfile(data);
      setProfileError(null);
      return data;
    },
    [userId],
  );

  const refreshProfile = useCallback(() => loadProfile(userId), [loadProfile, userId]);

  const value = useMemo<AuthState>(
    () => ({
      isConfigured: isSupabaseConfigured,
      user: session?.user ?? null,
      session,
      profile,
      role: profile?.role ?? null,
      isLoading,
      profileError,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      updateProfile,
      refreshProfile,
    }),
    [session, profile, isLoading, profileError, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, updateProfile, refreshProfile],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

/**
 * One subscription and one profile query for the whole app — every caller
 * reads the same state from `AuthProvider` (mounted once in `App.tsx`).
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải nằm bên trong <AuthProvider>.');
  return ctx;
}
