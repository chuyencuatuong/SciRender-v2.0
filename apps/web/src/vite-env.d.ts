/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL của @scirender/pdf-server, vd. https://scirender-pdf-server.onrender.com/export-pdf */
  readonly VITE_PDF_SERVER_URL?: string;
  /** Phải khớp EXPORT_TOKEN phía máy chủ, nếu máy chủ có đặt. */
  readonly VITE_PDF_SERVER_TOKEN?: string;
}
