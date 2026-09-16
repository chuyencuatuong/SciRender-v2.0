/**
 * Copies the Vietnamese-capable webfont subsets out of @fontsource into
 * apps/web/public/fonts so the app ships its own type and never asks the
 * network for it (P5).
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'apps/web/public/fonts';
const WANT = [
  ['be-vietnam-pro', ['400', '500', '600']],
  ['literata', ['400', '500']],
  ['jetbrains-mono', ['400', '500']],
];
const SUBSETS = ['latin', 'latin-ext', 'vietnamese'];

mkdirSync(OUT, { recursive: true });

function resolveFiles(pkg) {
  const root = 'node_modules/.pnpm';
  const dir = readdirSync(root).find((d) => d.startsWith(`@fontsource+${pkg}@`));
  if (!dir) throw new Error(`Chưa cài @fontsource/${pkg} — chạy: pnpm install`);
  return join(root, dir, 'node_modules/@fontsource', pkg, 'files');
}

let n = 0;
for (const [pkg, weights] of WANT) {
  const files = resolveFiles(pkg);
  for (const subset of SUBSETS) {
    for (const weight of weights) {
      const name = `${pkg}-${subset}-${weight}-normal.woff2`;
      copyFileSync(join(files, name), join(OUT, name));
      n++;
    }
  }
}
console.log(`Đã đồng bộ ${n} tệp font vào ${OUT}`);
