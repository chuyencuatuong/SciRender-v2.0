import { ArrowRight, Atom, CircleUserRound } from 'lucide-react';
import { isSupabaseConfigured } from '~/lib/supabase';

/**
 * Placeholder for `/` until a real landing page exists. The editor stays one
 * click away and needs no account (guest mode is the v2.8 behaviour).
 */
export function LandingRoute(): JSX.Element {
  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-[#070b14] px-6 py-12 font-ui text-slate-100">
      <main className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
          <Atom size={26} aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl tracking-tight text-slate-50">SciRender</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          Soạn báo cáo khoa học, bài tập lớn Bách khoa với đánh số, trích dẫn, công thức và trang bìa đúng quy cách.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#app"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0052cc] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0052cc]/20 transition hover:bg-[#0b61dc]"
          >
            Vào Editor <ArrowRight size={16} />
          </a>
          {isSupabaseConfigured ? (
            <a
              href="#dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
            >
              <CircleUserRound size={16} /> Đăng nhập / Tài khoản
            </a>
          ) : null}
        </div>
        <p className="mt-6 text-xs text-slate-500">
          {isSupabaseConfigured
            ? 'Không cần tài khoản để dùng trình soạn thảo. Đăng nhập để lưu hồ sơ và tự điền trang bìa.'
            : 'Bản này chạy ở chế độ khách: tài liệu lưu trong trình duyệt của máy này.'}
        </p>
      </main>
    </div>
  );
}
