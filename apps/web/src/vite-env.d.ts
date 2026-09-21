/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL của @scirender/pdf-server, vd. https://scirender-pdf-server.onrender.com/export-pdf */
  readonly VITE_PDF_SERVER_URL?: string;
  /** Phải khớp EXPORT_TOKEN phía máy chủ, nếu máy chủ có đặt. */
  readonly VITE_PDF_SERVER_TOKEN?: string;
  /** Supabase → Project Settings → API → Project URL, vd. https://abcd.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase → Project Settings → API → anon public key. KHÔNG dùng service_role. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
