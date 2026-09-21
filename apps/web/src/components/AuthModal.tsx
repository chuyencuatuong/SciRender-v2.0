import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

export type AuthMode = 'login' | 'register';

export interface AuthModalProps {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void> | void;
  onEmailSubmit: (payload: {
    email: string;
    password: string;
    mode: AuthMode;
  }) => Promise<void> | void;
  onGuestMode: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M21.35 12.23c0-.74-.07-1.45-.21-2.13H12v4.03h5.24a4.48 4.48 0 0 1-1.95 2.94v2.44h3.15c1.84-1.69 2.91-4.18 2.91-7.28Z"
        fill="#4285F4"
      />
      <path
        d="M12 21.75c2.63 0 4.84-.87 6.45-2.35l-3.15-2.44c-.87.58-1.98.92-3.3.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.52A9.74 9.74 0 0 0 12 21.75Z"
        fill="#34A853"
      />
      <path
        d="M6.53 13.85a5.85 5.85 0 0 1 0-3.7V7.63H3.28a9.75 9.75 0 0 0 0 8.74l3.25-2.52Z"
        fill="#FBBC04"
      />
      <path
        d="M12 6.12c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.84 3.17 14.63 2.25 12 2.25a9.74 9.74 0 0 0-8.72 5.38l3.25 2.52C7.3 7.84 9.46 6.12 12 6.12Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AuthModal({
  open,
  initialMode = 'login',
  onClose,
  onGoogleSignIn,
  onEmailSubmit,
  onGuestMode,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<'google' | 'email' | 'guest' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode(initialMode);
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setBusyAction(null);
    setErrorMessage('');
  }, [initialMode, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busyAction === null) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busyAction, onClose, open]);

  if (!open) {
    return null;
  }

  const isBusy = busyAction !== null;

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setBusyAction('email');

    try {
      await onEmailSubmit({
        email: email.trim(),
        password,
        mode,
      });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setBusyAction('google');

    try {
      await onGoogleSignIn();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const handleGuestMode = () => {
    setErrorMessage('');
    setBusyAction('guest');
    onGuestMode();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="scirender-auth-title"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424] shadow-2xl shadow-black/50"
        role="dialog"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38bdf8] to-transparent" />

        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <LogIn className="h-3.5 w-3.5" />
              SciRender Account
            </div>
            <h2 id="scirender-auth-title" className="text-xl font-semibold tracking-tight text-slate-100">
              {mode === 'login' ? 'Đăng nhập SciRender' : 'Tạo tài khoản mới'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {mode === 'login'
                ? 'Tiếp tục làm việc với tài liệu và hồ sơ học thuật của bạn.'
                : 'Lưu tài liệu trên đám mây và đồng bộ hồ sơ học thuật.'}
            </p>
          </div>

          <button
            type="button"
            aria-label="Đóng cửa sổ đăng nhập"
            disabled={isBusy}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-500/40 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
            Đăng nhập nhanh bằng Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">Hoặc email</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="scirender-auth-email">
                Email
              </label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="scirender-auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 bg-[#070b14] py-3 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/10"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="scirender-auth-password">
                Mật khẩu
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="scirender-auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 bg-[#070b14] py-3 pl-10 pr-11 text-sm text-slate-100 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0052cc] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0052cc]/20 transition hover:bg-[#0b61dc] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'email' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="h-5 w-5" />
              ) : (
                <UserPlus className="h-5 w-5" />
              )}
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">
              {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            </span>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setMode((current) => (current === 'login' ? 'register' : 'login'));
                setErrorMessage('');
              }}
              className="font-semibold text-sky-300 transition hover:text-sky-200 disabled:opacity-50"
            >
              {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </div>

          <div className="my-5 h-px bg-slate-800" />

          <button
            type="button"
            disabled={isBusy}
            onClick={handleGuestMode}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-transparent px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === 'guest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-sky-400" />}
            Dùng thử ngay không cần tài khoản
            <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
          </button>

          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Chế độ khách phù hợp để thử trình soạn thảo. Tài liệu của khách có thể chỉ tồn tại cục bộ tùy cấu hình lưu trữ của ứng dụng.
          </p>
        </div>
      </section>
    </div>
  );
}
