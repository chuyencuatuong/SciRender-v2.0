import { ArrowLeft, Atom, LogOut, PencilLine, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Thin bar shared by the non-editor routes: the portal components are pure
 * presentational drops, so navigation (editor / admin / sign-out) lives here.
 * Visual language follows the portal's own dark palette.
 */
export function RouteChrome({
  children,
  back,
  showAdmin = false,
  onSignOut,
}: {
  children: ReactNode;
  back?: { href: string; label: string };
  showAdmin?: boolean;
  onSignOut?: () => void;
}): JSX.Element {
  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white';
  return (
    // body is overflow:hidden for the editor's fixed layout, so each portal
    // route owns its scroll container.
    <div className="h-full overflow-y-auto bg-[#070b14] font-ui text-slate-100">
      <div className="sticky top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-slate-800 bg-[#070b14]/90 px-4 backdrop-blur">
        <a href="#" className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Atom size={16} className="text-sky-400" aria-hidden="true" />
          SciRender
        </a>
        <nav className="flex items-center gap-2" aria-label="Điều hướng">
          {back ? (
            <a href={back.href} className={btn}>
              <ArrowLeft size={14} /> {back.label}
            </a>
          ) : null}
          {showAdmin ? (
            <a href="#admin" className={btn}>
              <ShieldCheck size={14} /> Quản trị
            </a>
          ) : null}
          <a href="#app" className={`${btn} border-sky-500/30 text-sky-200`}>
            <PencilLine size={14} /> Vào Editor
          </a>
          {onSignOut ? (
            <button type="button" onClick={onSignOut} className={btn}>
              <LogOut size={14} /> Đăng xuất
            </button>
          ) : null}
        </nav>
      </div>
      {children}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
  onClose,
}: {
  tone?: 'info' | 'error';
  children: ReactNode;
  onClose?: () => void;
}): JSX.Element {
  const cls =
    tone === 'error'
      ? 'border-rose-500/20 bg-rose-500/10 text-rose-200'
      : 'border-sky-500/20 bg-sky-500/10 text-sky-100';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mx-4 mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6 sm:mx-7 xl:mx-10 ${cls}`}>
      <div className="flex-1">{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-xs font-semibold opacity-70 hover:opacity-100">
          Đóng
        </button>
      ) : null}
    </div>
  );
}
