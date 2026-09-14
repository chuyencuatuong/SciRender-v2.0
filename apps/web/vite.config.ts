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
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          katex: ['katex'],
          mermaid: ['mermaid'],
          codemirror: ['codemirror', '@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown'],
        },
      },
    },
  },
});
