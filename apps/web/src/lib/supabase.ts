import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for SciRender accounts.
 *
 * The editor must keep working with no `.env` at all (local-first, P5/P6):
 * `createClient('')` throws at import time, which would take the whole app
 * down with it. So a missing configuration yields `null`, and every caller
 * checks `isSupabaseConfigured` / `requireSupabase()` and says so on screen.
 *
 * Only the public anon key belongs here. It is safe in the browser *because*
 * every table has RLS (see supabase/migrations). The service_role key must
 * never be put in any `VITE_*` variable — Vite inlines those into the bundle.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = /^https:\/\/\S+$/.test(url) && anonKey.length > 20;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns `?code=` in the query string, leaving the `#route`
        // hash alone. The implicit flow would overwrite the hash with tokens.
        flowType: 'pkce',
      },
    })
  : null;

export const SUPABASE_NOT_CONFIGURED =
  'Chưa cấu hình tài khoản: thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong apps/web/.env. ' +
  'Trình soạn thảo vẫn dùng được ở chế độ khách.';

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED);
  return supabase;
}

/**
 * Where OAuth / e-mail confirmation should land: the app's own base URL with
 * no hash (GitHub Pages serves under /<repo>/, so `pathname` is kept).
 * Must be listed in Supabase → Authentication → URL Configuration.
 */
export function authRedirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
