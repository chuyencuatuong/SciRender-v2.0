import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = (name: string): string =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

/**
 * Workspace packages are consumed as TypeScript source. Explicit aliases mean
 * the app builds identically under pnpm, npm or yarn, and HMR reaches into the
 * packages without a watch-and-rebuild step.
 */
export default defineConfig({
  // GitHub Pages serves the site from /<repo>/, so the asset base must change
  // there. Everywhere else (dev, local preview, a plain static host) it is "/".
  // The Pages workflow sets VITE_BASE; nothing else needs to know.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@scirender/ast': pkg('ast'),
      '@scirender/parser': pkg('parser'),
      '@scirender/validator': pkg('validator'),
      '@scirender/intelligence': pkg('intelligence'),
      '@scirender/template-engine': pkg('template-engine'),
      '@scirender/layout-engine': pkg('layout-engine'),
      '@scirender/renderer-html': pkg('renderer-html'),
      '@scirender/renderer-pdf': pkg('renderer-pdf'),
      '@scirender/citation-engine': pkg('citation-engine'),
      '@scirender/equation-engine': pkg('equation-engine'),
      '@scirender/figure-engine': pkg('figure-engine'),
      '@scirender/table-engine': pkg('table-engine'),
      '@scirender/storage': pkg('storage'),
      '@scirender/telemetry': pkg('telemetry'),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id): string | undefined {
          // `'\\\\'` in a TS string literal is TWO backslash characters, so the
          // old call only rewrote `\\` pairs — which a Windows path does not
          // contain. Every `normalized.includes('/packages/...')` test below
          // therefore silently failed on Windows and the workspace packages
          // fell back into the entry chunk. One backslash is what a Windows
          // path actually uses.
          const normalized = id.replaceAll('\\', '/');

          if (normalized.includes('/node_modules/')) {
            if (
              normalized.includes('/react/') ||
              normalized.includes('/react-dom/') ||
              normalized.includes('/scheduler/')
            ) return 'vendor-react';

            if (normalized.includes('/katex/')) return 'vendor-math';
            if (normalized.includes('/mermaid/')) return 'vendor-diagram';

            if (
              normalized.includes('/framer-motion/') ||
              normalized.includes('/zustand/') ||
              normalized.includes('/idb/') ||
              normalized.includes('/lucide-react/')
            ) return 'vendor-ui';
          }

          // Vite resolves workspace imports to source files. Chunking by
          // package path keeps scientific engines out of the initial UI even
          // though the workspace packages are not published node_modules.
          if (
            normalized.includes('/packages/equation-engine/')
          ) return 'vendor-math';

          if (
            normalized.includes('/packages/intelligence/') ||
            normalized.includes('/packages/validator/')
          ) return 'vendor-intelligence';

          if (normalized.includes('/packages/renderer-html/')) return 'vendor-renderer';
          if (normalized.includes('/packages/renderer-pdf/')) return 'vendor-pdf';

          if (
            normalized.includes('/apps/web/src/lib/mermaid.') ||
            normalized.includes('/apps/web/src/lib/diagram-studio.')
          ) return 'vendor-diagram';

          return undefined;
        },
      },
    },
  },
});
