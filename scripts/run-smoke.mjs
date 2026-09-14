/**
 * Bundles the TypeScript smoke test with esbuild (already present as a Vite
 * dependency) and runs it in Node. Keeps the repo free of an extra test runner.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// The bundle must live inside the repo so Node resolves node_modules from here.
const dir = join('node_modules', '.cache', 'scirender');
mkdirSync(dir, { recursive: true });
const outfile = join(dir, 'smoke.mjs');

try {
  await build({
    entryPoints: ['scripts/smoke.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'error',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
